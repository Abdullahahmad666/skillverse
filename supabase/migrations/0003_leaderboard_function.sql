-- ============================================================
-- SkillVerse V2.1 — replace the cohort_leaderboard SECURITY DEFINER
-- view with a SECURITY DEFINER function.
--
-- Why: Supabase's database linter flags SECURITY DEFINER *views*
-- (0010_security_definer_view) because their definer semantics are easy
-- to miss. A definer FUNCTION expresses the same privilege boundary
-- explicitly, lets us revoke EXECUTE from anon, and pins search_path.
--
-- The security contract is unchanged:
--   * caller must be a member of the requested cohort,
--   * only opted-in users (or the caller themself) are returned,
--   * only display name, username, avatar, and milestone count are
--     exposed — never raw progress rows of other users.
-- ============================================================

drop view if exists public.cohort_leaderboard;

create or replace function public.get_cohort_leaderboard(p_cohort_id uuid)
returns table (
  user_id           uuid,
  display_name      text,
  username          text,
  avatar_url        text,
  joined_at         timestamptz,
  milestones_passed int
)
language sql stable security definer set search_path = public
as $$
  select
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
  where cm.cohort_id = p_cohort_id
    and public.is_cohort_member(p_cohort_id)
    and (p.show_on_leaderboard = true or cm.user_id = auth.uid())
  order by milestones_passed desc, cm.joined_at asc;
$$;

revoke execute on function public.get_cohort_leaderboard(uuid) from public, anon;
grant  execute on function public.get_cohort_leaderboard(uuid) to authenticated;
