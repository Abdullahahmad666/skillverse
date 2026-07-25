-- ============================================================
-- SkillVerse — admin content management
-- Run after 0008.
--
-- Enables an in-app admin form to author roadmap CONTENT (skills, stages,
-- steps, resources, milestones) without touching the app's structure or its
-- checkpoint / explain / quiz / milestone features — those all read the same
-- columns this admin edits.
--
-- Security model:
--   * profiles.is_admin marks admins. It CANNOT be self-granted: the column's
--     UPDATE privilege is revoked from clients, so only the service role
--     (SQL editor / dashboard) can promote a user. RLS still lets users edit
--     their own other profile fields.
--   * Content tables were read-only to clients (0001/0006). We add
--     INSERT/UPDATE/DELETE policies gated on is_current_user_admin(), so only
--     admins can write — enforced in the database, not just the UI.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Admin flag (not self-grantable)
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Clients may read is_admin (so the UI can gate) but never write it.
revoke update (is_admin) on public.profiles from anon, authenticated;

-- SECURITY DEFINER so the check can read profiles regardless of the caller's
-- RLS view; STABLE so it is evaluated efficiently within a statement.
create or replace function public.is_current_user_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;
grant execute on function public.is_current_user_admin() to authenticated;

-- ------------------------------------------------------------
-- 2. Admin write policies on the content tables
--    (SELECT policies already exist and stay unchanged.)
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'skills', 'stages', 'roadmap_steps', 'resources', 'milestones'
  ]
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_current_user_admin());',
      'admins insert ' || t, t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin());',
      'admins update ' || t, t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_current_user_admin());',
      'admins delete ' || t, t);
  end loop;
end
$$;

-- ------------------------------------------------------------
-- 3. Promote yourself (run manually, replacing the email)
-- ------------------------------------------------------------
-- update public.profiles set is_admin = true
--  where id = (select id from auth.users where email = 'abdullah.ahmad3579@gmail.com');
