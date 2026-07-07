-- ============================================================
-- SkillVerse V2 — Cohorts, streaks, cohort-relative leaderboard
-- Run after 0001_init.sql (Supabase SQL editor or `supabase db push`).
--
-- Security model recap (do not regress):
--  * RLS is enabled on EVERY new table.
--  * `cohorts` is read-only to clients; rows are created/rotated ONLY by
--    the SECURITY DEFINER function `join_current_cohort` (server-side).
--  * `cohort_members` is readable only within your own cohorts; you can
--    only insert your own membership, and only into an open cohort.
--  * Other users' progress is NEVER readable directly. Leaderboard and
--    standing data flow exclusively through the SECURITY DEFINER view
--    `cohort_leaderboard` / function `get_cohort_standing`, which return
--    only display name, avatar, and milestone counts / aggregates.
--  * Leaderboard opt-out (`profiles.show_on_leaderboard`, default false)
--    is enforced INSIDE the view — an opted-out user is not returnable
--    by any client query, regardless of frontend behavior.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Schema changes
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists show_on_leaderboard boolean not null default false;

create table public.cohorts (
  id         uuid primary key default gen_random_uuid(),
  skill_id   uuid not null references public.skills (id) on delete cascade,
  label      text not null,
  start_date date not null default current_date,
  status     text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

-- At most one open cohort per skill at any time.
create unique index cohorts_one_open_per_skill
  on public.cohorts (skill_id) where (status = 'open');
create index cohorts_skill_idx on public.cohorts (skill_id, status);

create table public.cohort_members (
  id        uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (cohort_id, user_id)
);
create index cohort_members_user_idx   on public.cohort_members (user_id);
create index cohort_members_cohort_idx on public.cohort_members (cohort_id);

-- Streak bookkeeping. Maintained exclusively by the trigger below —
-- clients can read their own row but never write it.
-- "Milestones passed" is intentionally NOT stored here: it is derived
-- live (one indexed count per member) so it can never drift out of sync
-- when a user un-checks a step and a milestone is revoked.
create table public.user_stats (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  current_streak   integer not null default 0,
  longest_streak   integer not null default 0,
  last_active_date date,
  updated_at       timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Row Level Security
-- ------------------------------------------------------------

alter table public.cohorts        enable row level security;
alter table public.cohort_members enable row level security;
alter table public.user_stats     enable row level security;

-- cohorts: read-only to authenticated users. No insert/update/delete
-- policies exist → all client writes are denied; rows are managed by
-- the SECURITY DEFINER `join_current_cohort` function only.
create policy "cohorts readable by authenticated users"
  on public.cohorts for select to authenticated
  using (true);

-- Membership check that bypasses RLS on cohort_members. Needed because a
-- cohort_members policy that queries cohort_members directly would recurse.
create or replace function public.is_cohort_member(p_cohort_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.cohort_members
    where cohort_id = p_cohort_id and user_id = auth.uid()
  );
$$;
revoke execute on function public.is_cohort_member(uuid) from public, anon;
grant  execute on function public.is_cohort_member(uuid) to authenticated;

-- cohort_members: you can see the member list only of cohorts you belong to.
create policy "members readable within own cohorts"
  on public.cohort_members for select to authenticated
  using (user_id = auth.uid() or public.is_cohort_member(cohort_id));

-- You may only insert YOURSELF, and only into a cohort that is still open.
create policy "users insert own membership into open cohorts"
  on public.cohort_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.cohorts c
      where c.id = cohort_id and c.status = 'open'
    )
  );
-- No update/delete policies: membership is permanent from the client's side.

-- user_stats: owner-read only. No write policies — the streak trigger
-- (SECURITY DEFINER) is the only writer.
create policy "users read own stats"
  on public.user_stats for select to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 3. Enrollment: join (or lazily create/rotate) the current open cohort
-- ------------------------------------------------------------
-- Cohort windows are monthly. Called on enroll and on dashboard load
-- (idempotent), so pre-V2 users are healed automatically and stale open
-- cohorts are rotated lazily without any scheduled job.

create or replace function public.join_current_cohort(p_skill_id uuid)
returns public.cohorts
language plpgsql security definer set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_skill_title text;
  v_cohort      public.cohorts;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select title into v_skill_title from public.skills where id = p_skill_id;
  if v_skill_title is null then
    raise exception 'unknown skill';
  end if;

  -- Rotate: close any open cohort that started in a previous month.
  update public.cohorts
     set status = 'closed'
   where skill_id = p_skill_id
     and status = 'open'
     and date_trunc('month', start_date) < date_trunc('month', current_date);

  select * into v_cohort
    from public.cohorts
   where skill_id = p_skill_id and status = 'open'
   limit 1;

  if v_cohort.id is null then
    begin
      insert into public.cohorts (skill_id, label, start_date)
      values (
        p_skill_id,
        to_char(current_date, 'FMMonth YYYY') || ' ' || v_skill_title || ' cohort',
        current_date
      )
      returning * into v_cohort;
    exception when unique_violation then
      -- Concurrent enroll created it first — use that one.
      select * into v_cohort
        from public.cohorts
       where skill_id = p_skill_id and status = 'open'
       limit 1;
    end;
  end if;

  insert into public.cohort_members (cohort_id, user_id)
  values (v_cohort.id, v_uid)
  on conflict (cohort_id, user_id) do nothing;

  return v_cohort;
end;
$$;
revoke execute on function public.join_current_cohort(uuid) from public, anon;
grant  execute on function public.join_current_cohort(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Streaks
-- ------------------------------------------------------------
-- A streak = consecutive UTC days with at least one step completed.
-- Bumped whenever a user_progress row transitions into 'done'.
-- Un-checking a step never shrinks a streak (activity happened that day).
-- A lapsed streak (last activity before yesterday) is rendered as 0 by
-- the client; the stored value is only reset the next time the user
-- completes something.

create or replace function public.bump_user_streak()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if (tg_op = 'INSERT' and new.status = 'done')
     or (tg_op = 'UPDATE' and new.status = 'done' and old.status is distinct from 'done') then
    insert into public.user_stats as us (user_id, current_streak, longest_streak, last_active_date, updated_at)
    values (new.user_id, 1, 1, v_today, now())
    on conflict (user_id) do update
      set current_streak = case
            when us.last_active_date = v_today     then us.current_streak
            when us.last_active_date = v_today - 1 then us.current_streak + 1
            else 1
          end,
          longest_streak = greatest(us.longest_streak, case
            when us.last_active_date = v_today     then us.current_streak
            when us.last_active_date = v_today - 1 then us.current_streak + 1
            else 1
          end),
          last_active_date = v_today,
          updated_at = now();
  end if;
  return new;
end;
$$;

create trigger on_user_progress_done
  after insert or update on public.user_progress
  for each row execute function public.bump_user_streak();

-- ------------------------------------------------------------
-- 5. Cohort leaderboard (SECURITY DEFINER view)
-- ------------------------------------------------------------
-- Runs with the view owner's privileges (bypasses RLS on user_milestones)
-- but exposes ONLY: display name, username, avatar, milestone count.
-- Row visibility is locked down inside the view:
--   * caller must be a member of the cohort (is_cohort_member), and
--   * the target user opted in — or is the caller themself (your own row
--     is always visible to you so your rank/standing still works).
-- Opt-out is therefore enforced at the DB layer: no client query can
-- return an opted-out user's row.

create view public.cohort_leaderboard
with (security_barrier = true) as
select
  cm.cohort_id,
  cm.user_id,
  p.display_name,
  p.username,
  p.avatar_url,
  cm.joined_at,
  -- "Milestones passed" = achieved user_milestones for the cohort's skill.
  -- V1 semantics: a milestone is achieved when every step up to its anchor
  -- step is done (synced by the app in useRoadmap.syncMilestones).
  -- TODO(V3 quizzes): when checkpoint quizzes ship, count a milestone only
  -- when its quiz is passed — replace this subquery with a join against
  -- quiz_attempts (passed = true) instead of raw user_milestones.
  (
    select count(*)::int
    from public.user_milestones um
    join public.milestones m on m.id = um.milestone_id
    where um.user_id = cm.user_id
      and m.skill_id = c.skill_id
  ) as milestones_passed
from public.cohort_members cm
join public.cohorts  c on c.id = cm.cohort_id
join public.profiles p on p.id = cm.user_id
where public.is_cohort_member(cm.cohort_id)
  and (p.show_on_leaderboard = true or cm.user_id = auth.uid());

revoke all on public.cohort_leaderboard from public, anon;
grant select on public.cohort_leaderboard to authenticated;

-- ------------------------------------------------------------
-- 6. Cohort standing (SECURITY DEFINER function, aggregates only)
-- ------------------------------------------------------------
-- "Ahead of N% of your cohort." Counts ALL cohort members (including
-- opted-out ones — they appear only inside anonymous aggregate numbers,
-- never as rows). Returns nothing if the caller isn't a cohort member.

create or replace function public.get_cohort_standing(p_cohort_id uuid)
returns table (total_members int, members_behind int, my_milestones int)
language sql stable security definer set search_path = public
as $$
  with skill as (
    select c.skill_id from public.cohorts c where c.id = p_cohort_id
  ),
  counts as (
    select
      cm.user_id,
      (
        select count(*)
        from public.user_milestones um
        join public.milestones m on m.id = um.milestone_id
        where um.user_id = cm.user_id
          and m.skill_id = (select skill_id from skill)
      ) as n
    from public.cohort_members cm
    where cm.cohort_id = p_cohort_id
  ),
  mine as (
    select coalesce(max(n), 0) as n from counts where user_id = auth.uid()
  )
  select
    count(*)::int                                    as total_members,
    (count(*) filter (where counts.n < mine.n))::int as members_behind,
    mine.n::int                                      as my_milestones
  from counts cross join mine
  group by mine.n
  having public.is_cohort_member(p_cohort_id);
$$;
revoke execute on function public.get_cohort_standing(uuid) from public, anon;
grant  execute on function public.get_cohort_standing(uuid) to authenticated;
