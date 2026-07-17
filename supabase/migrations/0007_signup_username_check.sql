-- Pre-signup username availability check + clearer trigger failure on duplicates.

create or replace function public.username_is_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles where username = p_username
  );
$$;

grant execute on function public.username_is_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_username text := nullif(new.raw_user_meta_data ->> 'username', '');
begin
  if v_username is not null and exists (
    select 1 from public.profiles where username = v_username
  ) then
    raise exception 'username_taken' using errcode = '23505';
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    v_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
             split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
