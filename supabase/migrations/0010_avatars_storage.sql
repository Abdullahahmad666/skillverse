-- ============================================================
-- SkillVerse — avatar uploads (Storage)
-- Run after 0009.
--
-- Adds a public "avatars" bucket so users can upload a photo or a live selfie
-- instead of only pasting a URL. Files are namespaced by user id
-- (avatars/<uid>/...), and Storage RLS lets each user write ONLY their own
-- folder while anyone may read (public profile images).
-- ============================================================

-- Public bucket (read is open; writes are gated by the policies below).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone can view avatar images.
create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- A user may upload only into their own folder: avatars/<their-uid>/...
create policy "Users upload their own avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update their own avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete their own avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
