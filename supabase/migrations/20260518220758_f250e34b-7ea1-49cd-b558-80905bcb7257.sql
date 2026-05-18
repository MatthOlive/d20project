create table public.tokens (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  character_kind text not null check (character_kind in ('pokemon','trainer')),
  character_id uuid not null,
  label text not null default '',
  image_url text,
  x double precision not null default 0.5,
  y double precision not null default 0.5,
  size integer not null default 56,
  owner_id uuid not null,
  created_at timestamp with time zone not null default now()
);

create index tokens_game_idx on public.tokens(game_id);

alter table public.tokens enable row level security;

create policy "members view tokens" on public.tokens
  for select to authenticated
  using (public.is_game_member(game_id, auth.uid()));

create policy "owner or narrator inserts tokens" on public.tokens
  for insert to authenticated
  with check (public.can_edit_character(game_id, owner_id));

create policy "owner or narrator updates tokens" on public.tokens
  for update to authenticated
  using (public.can_edit_character(game_id, owner_id));

create policy "owner or narrator deletes tokens" on public.tokens
  for delete to authenticated
  using (public.can_edit_character(game_id, owner_id));

alter publication supabase_realtime add table public.tokens;
alter table public.tokens replica identity full;