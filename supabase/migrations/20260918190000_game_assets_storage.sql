insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'game-assets',
  'game-assets',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Preserve the existing behavior for other writable buckets, while ensuring
-- game assets can only be created or changed inside the signed-in user's folder.
drop policy if exists "pokerole2 no client insert" on storage.objects;
drop policy if exists "pokerole2 no client update" on storage.objects;
drop policy if exists "pokerole2 no client delete" on storage.objects;

create policy "authenticated writable assets insert"
on storage.objects for insert to authenticated
with check (
  bucket_id <> 'pokerole2'
  and (
    bucket_id <> 'game-assets'
    or (storage.foldername(name))[1] = (select auth.uid()::text)
  )
);

create policy "authenticated writable assets update"
on storage.objects for update to authenticated
using (
  bucket_id <> 'pokerole2'
  and (
    bucket_id <> 'game-assets'
    or (storage.foldername(name))[1] = (select auth.uid()::text)
  )
)
with check (
  bucket_id <> 'pokerole2'
  and (
    bucket_id <> 'game-assets'
    or (storage.foldername(name))[1] = (select auth.uid()::text)
  )
);

create policy "authenticated writable assets delete"
on storage.objects for delete to authenticated
using (
  bucket_id <> 'pokerole2'
  and (
    bucket_id <> 'game-assets'
    or (storage.foldername(name))[1] = (select auth.uid()::text)
  )
);
