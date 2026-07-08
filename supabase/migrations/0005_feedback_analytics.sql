-- ============================================================
-- SkillVerse V2.3 — feedback, skill requests (waitlist), funnel events
-- Run after 0004.
--
-- Security model:
--  * RLS is enabled on all three tables with ZERO policies — clients can
--    neither read nor write them directly. All writes flow through the
--    SECURITY DEFINER functions below, which validate, sanitize, and
--    rate-limit every submission. Reads are admin-only (dashboard /
--    service role).
--  * Rate limiting reuses the edge_function_calls ledger from 0001
--    (service-role/definer only), keyed per user id or per client IP
--    (from the PostgREST request headers) for anonymous callers.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------

create table public.feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users (id) on delete set null,
  page       text not null check (char_length(page) <= 80),
  rating     integer not null check (rating between 1 and 5),
  message    text check (message is null or char_length(message) <= 1000),
  created_at timestamptz not null default now()
);

create table public.skill_requests (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null check (char_length(email) <= 254),
  requested_skill_text text not null check (char_length(requested_skill_text) <= 120),
  created_at           timestamptz not null default now()
);

create table public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  event_name text not null check (event_name in
    ('signup', 'skill_started', 'step_completed', 'roadmap_viewed', 'feedback_submitted')),
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_name_idx on public.events (event_name, created_at desc);

-- RLS on, no policies: direct client access fully denied (read AND write).
alter table public.feedback       enable row level security;
alter table public.skill_requests enable row level security;
alter table public.events         enable row level security;

-- Belt and braces: revoke table privileges from client roles entirely.
revoke all on public.feedback       from anon, authenticated;
revoke all on public.skill_requests from anon, authenticated;
revoke all on public.events         from anon, authenticated;

-- ------------------------------------------------------------
-- 2. Helpers (internal — not executable by clients)
-- ------------------------------------------------------------

-- Identity key for rate limiting: user id when signed in, client IP otherwise.
create or replace function public.rl_caller_key()
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_ip text;
begin
  if auth.uid() is not null then
    return 'user:' || auth.uid()::text;
  end if;
  begin
    v_ip := split_part(
      coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
      ',', 1);
  exception when others then
    v_ip := '';
  end;
  return 'ip:' || coalesce(nullif(trim(v_ip), ''), 'unknown');
end;
$$;
revoke execute on function public.rl_caller_key() from public, anon, authenticated;

-- Sliding-window rate limit backed by edge_function_calls (definer-only table).
-- Raises 'rate_limited' when the budget is exhausted; records the call otherwise.
create or replace function public.rl_check(p_fn text, p_limit int, p_window interval)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_caller text := public.rl_caller_key();
  v_count  int;
begin
  select count(*) into v_count
    from public.edge_function_calls
   where fn = p_fn and caller = v_caller and called_at > now() - p_window;
  if v_count >= p_limit then
    raise exception 'rate_limited';
  end if;
  insert into public.edge_function_calls (fn, caller) values (p_fn, v_caller);
  -- Opportunistic cleanup (~1% of calls) of entries older than a day.
  if random() < 0.01 then
    delete from public.edge_function_calls where called_at < now() - interval '24 hours';
  end if;
end;
$$;
revoke execute on function public.rl_check(text, int, interval) from public, anon, authenticated;

-- Strip control characters and trim — defense-in-depth against stored XSS
-- payload shaping; admin display must still escape output as usual.
create or replace function public.clean_text(p_value text, p_max int)
returns text
language sql immutable
as $$
  select left(trim(regexp_replace(coalesce(p_value, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), p_max);
$$;
revoke execute on function public.clean_text(text, int) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Public RPCs (the only write path)
-- ------------------------------------------------------------

-- Feedback: signed-in OR anonymous. Max 5 per caller per hour.
create or replace function public.submit_feedback(p_page text, p_rating int, p_message text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_message text;
begin
  perform public.rl_check('submit_feedback', 5, interval '1 hour');
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_input';
  end if;
  v_message := nullif(public.clean_text(p_message, 1000), '');
  insert into public.feedback (user_id, page, rating, message)
  values (auth.uid(), public.clean_text(p_page, 80), p_rating, v_message);
end;
$$;
grant execute on function public.submit_feedback(text, int, text) to anon, authenticated;

-- Skill request / waitlist: signed-in OR anonymous. Max 3 per caller per hour.
create or replace function public.request_skill(p_email text, p_skill text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(public.clean_text(p_email, 254));
  v_skill text := public.clean_text(p_skill, 120);
begin
  perform public.rl_check('request_skill', 3, interval '1 hour');
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'invalid_input';
  end if;
  if v_skill = '' then
    raise exception 'invalid_input';
  end if;
  insert into public.skill_requests (email, requested_skill_text)
  values (v_email, v_skill);
end;
$$;
grant execute on function public.request_skill(text, text) to anon, authenticated;

-- Funnel events: authenticated only, whitelisted names, small metadata.
-- Max 120 per user per hour (generous for real use, blocks floods).
create or replace function public.log_event(p_event_name text, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  perform public.rl_check('log_event', 120, interval '1 hour');
  if p_event_name not in
     ('signup', 'skill_started', 'step_completed', 'roadmap_viewed', 'feedback_submitted') then
    raise exception 'invalid_input';
  end if;
  if pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 2048 then
    raise exception 'invalid_input';
  end if;
  insert into public.events (user_id, event_name, metadata)
  values (auth.uid(), p_event_name, coalesce(p_metadata, '{}'::jsonb));
end;
$$;
revoke execute on function public.log_event(text, jsonb) from public, anon;
grant  execute on function public.log_event(text, jsonb) to authenticated;
