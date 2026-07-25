-- ============================================================
-- SkillVerse — public reviews wall (landing page "Wall of love")
-- Run after 0007.
--
-- Unlike public.feedback (0005, fully private, admin-only reads), this table
-- is PUBLIC by design: it is the testimonial wall shown to every visitor,
-- updated in real time. To keep it honest but not a spam vector:
--   * Anyone may READ visible reviews (RLS select policy).
--   * Nobody may write directly — inserts flow ONLY through the
--     submit_review() SECURITY DEFINER RPC, which sanitizes, validates and
--     rate-limits (reusing rl_check / clean_text from 0005).
--   * A `hidden` flag lets an admin (service role) retract an abusive review
--     without a schema change; hidden rows are invisible to clients and to
--     realtime (the select policy filters them out).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete set null,
  display_name text not null check (char_length(display_name) between 2 and 60),
  rating       integer not null check (rating between 1 and 5),
  message      text not null check (char_length(message) between 4 and 1000),
  hidden       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index reviews_visible_idx on public.reviews (created_at desc) where hidden = false;

alter table public.reviews enable row level security;

-- Public read of visible reviews only (governs both REST and realtime).
create policy reviews_public_read on public.reviews
  for select to anon, authenticated
  using (hidden = false);

-- No client write policies => inserts/updates/deletes denied. Belt-and-braces
-- revoke of table-level write grants; reads stay open.
revoke insert, update, delete on public.reviews from anon, authenticated;
grant  select on public.reviews to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Write path — the only way a review is created
-- ------------------------------------------------------------
-- Signed-in OR anonymous. Max 5 per caller per hour (matches submit_feedback).
-- Returns the inserted row so the client can render it immediately.
create or replace function public.submit_review(p_name text, p_rating int, p_message text)
returns public.reviews
language plpgsql security definer set search_path = public
as $$
declare
  v_name    text := public.clean_text(p_name, 60);
  v_message text := public.clean_text(p_message, 1000);
  v_row     public.reviews;
begin
  perform public.rl_check('submit_review', 5, interval '1 hour');
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_input';
  end if;
  if char_length(v_name) < 2 or char_length(v_message) < 4 then
    raise exception 'invalid_input';
  end if;
  insert into public.reviews (user_id, display_name, rating, message)
  values (auth.uid(), v_name, p_rating, v_message)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.submit_review(text, int, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Realtime — broadcast inserts to the landing page
-- ------------------------------------------------------------
-- Adds the table to Supabase's realtime publication. RLS above still applies,
-- so only visible (non-hidden) rows ever reach subscribers.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.reviews;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 4. Seed testimonials (staggered timestamps so the wall looks lived-in)
-- ------------------------------------------------------------
insert into public.reviews (display_name, rating, message, created_at) values
  ('Ayesha Khan',    5, 'I''d bounced off three courses before this. One clear path and a project at every stage finally made it stick — I shipped my first real site in six weeks.', now() - interval '21 days'),
  ('Muhammad Bilal', 5, 'The streak freeze is genius. Missing a day used to make me quit entirely. Here it just forgave me, and I kept going.', now() - interval '18 days'),
  ('Fatima Zahra',   5, 'Every resource is hand-picked, so I never wasted an evening on a bad tutorial. The Figma case study is now the best piece in my portfolio.', now() - interval '15 days'),
  ('Hassan Raza',    4, 'Learning alongside a cohort that started the same month I did kept me honest. It''s the accountability I could never build alone.', now() - interval '12 days'),
  ('Zainab Malik',   5, 'The "explain this simpler" button saved me more times than I''ll admit. It''s like having a patient tutor for the exact step you''re stuck on.', now() - interval '10 days'),
  ('Ahmed Ali',      5, 'No 400-item checklist, no AI slop. Just the next right thing to do. I finally feel like I''m making real progress instead of collecting tabs.', now() - interval '8 days'),
  ('Sana Tariq',     5, 'The milestone projects are the whole point. I have three deployed things I can actually show people now, not certificates nobody reads.', now() - interval '6 days'),
  ('Usman Farooq',   4, 'Free, genuinely. I kept waiting for the paywall and it never came. The CLI tool I built is on my GitHub and it got me an interview.', now() - interval '5 days'),
  ('Hira Sheikh',    5, 'From "where do I even start" to a live website in two months. The staged path took all the guesswork out of learning to code.', now() - interval '3 days'),
  ('Abdullah Iqbal', 5, 'Honestly the first platform that felt built for finishing, not just signing up. My cohort keeps me showing up every single day.', now() - interval '2 days'),
  ('Mariam Javed',   5, 'I switched from watching endless YouTube tutorials to actually building. The difference in a month has been night and day.', now() - interval '1 day'),
  ('Bilal Ahmed',    4, 'Clean, calm, and encouraging. No ads, no upsells — just a roadmap and people learning beside me. Exactly what I needed.', now() - interval '8 hours');
