insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-assets',
  'game-assets',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- New objects are private. Members can read an asset only while a visible row
-- in their game references it. Writes remain restricted to the owner folder.
create or replace function public.can_read_game_asset(asset_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    exists (select 1 from public.games g where g.background_url = 'storage://game-assets/' || asset_name)
    or exists (select 1 from public.scenarios s where s.background_url = 'storage://game-assets/' || asset_name)
    or exists (select 1 from public.map_backgrounds mb where mb.image_url = 'storage://game-assets/' || asset_name)
    or exists (select 1 from public.trainers t where t.image_url = 'storage://game-assets/' || asset_name)
    or exists (select 1 from public.pokemon p where p.image_url = 'storage://game-assets/' || asset_name)
    or exists (select 1 from public.digirole_tamers t where t.image_url = 'storage://game-assets/' || asset_name)
    or exists (select 1 from public.digirole_digimons d where d.image_url = 'storage://game-assets/' || asset_name)
    or exists (
      select 1 from public.tokens tk
      where tk.image_url = 'storage://game-assets/' || asset_name
        and public.can_view_character(tk.game_id, tk.character_kind, tk.character_id)
    )
    or exists (
      select 1 from public.initiative i
      where i.image_url = 'storage://game-assets/' || asset_name
        and public.can_view_character(i.game_id, i.character_kind, i.character_ref)
    );
$$;
revoke all on function public.can_read_game_asset(text) from public, anon;
grant execute on function public.can_read_game_asset(text) to authenticated;

drop policy if exists "game assets readable by game members" on storage.objects;
create policy "game assets readable by game members"
on storage.objects for select to authenticated
using (bucket_id = 'game-assets' and public.can_read_game_asset(name));

drop policy if exists "game assets owner folder insert" on storage.objects;
create policy "game assets owner folder insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'game-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "game assets owner folder update" on storage.objects;
create policy "game assets owner folder update"
on storage.objects for update to authenticated
using (
  bucket_id = 'game-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'game-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "game assets owner folder delete" on storage.objects;
create policy "game assets owner folder delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'game-assets'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
