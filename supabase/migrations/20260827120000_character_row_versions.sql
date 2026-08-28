-- Optimistic concurrency metadata for locally cached character sheets.
alter table public.pokemon
  add column if not exists row_version bigint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.trainers
  add column if not exists row_version bigint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.bump_character_row_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.row_version := old.row_version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists pokemon_bump_row_version on public.pokemon;
create trigger pokemon_bump_row_version
before update on public.pokemon
for each row execute function public.bump_character_row_version();

drop trigger if exists trainers_bump_row_version on public.trainers;
create trigger trainers_bump_row_version
before update on public.trainers
for each row execute function public.bump_character_row_version();

notify pgrst, 'reload schema';
