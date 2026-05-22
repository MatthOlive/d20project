
alter table public.trainers
  add column if not exists sex text,
  add column if not exists custom_skills jsonb not null default '[]'::jsonb,
  add column if not exists badges jsonb not null default '[]'::jsonb;

alter table public.pokemon
  add column if not exists owner_trainer_id uuid references public.trainers(id) on delete set null,
  add column if not exists team_slot smallint;

alter table public.pokemon
  drop constraint if exists pokemon_team_slot_range;
alter table public.pokemon
  add constraint pokemon_team_slot_range check (team_slot is null or (team_slot between 1 and 6));

create unique index if not exists pokemon_team_slot_unique
  on public.pokemon(owner_trainer_id, team_slot)
  where team_slot is not null;

create index if not exists pokemon_owner_trainer_idx
  on public.pokemon(owner_trainer_id);
