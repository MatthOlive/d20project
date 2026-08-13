-- Pokemon Classic mode: persistent wild battles, turn order and automatic AI turns.

alter table public.classic_encounters
  add column if not exists wild_pokemon_id uuid references public.pokemon(id) on delete set null,
  add column if not exists player_pokemon_id uuid references public.pokemon(id) on delete set null,
  add column if not exists battle_phase text not null default 'choose_pokemon',
  add column if not exists active_side text,
  add column if not exists player_initiative integer,
  add column if not exists opponent_initiative integer,
  add column if not exists player_actions integer not null default 0,
  add column if not exists opponent_actions integer not null default 0,
  add column if not exists round_no integer not null default 1;

alter table public.classic_encounters
  drop constraint if exists classic_encounters_status_check,
  drop constraint if exists classic_encounters_battle_phase_check,
  drop constraint if exists classic_encounters_active_side_check,
  drop constraint if exists classic_encounters_action_counts_check;

-- Encounters created by the previous visual-only prototype cannot be resumed as battles.
update public.classic_encounters
set status = 'resolved',
    resolved_at = coalesce(resolved_at, now())
where status = 'pending'
  and wild_pokemon_id is null;

alter table public.classic_encounters
  add constraint classic_encounters_status_check
    check (status in ('pending', 'in_battle', 'won', 'lost', 'resolved', 'fled')),
  add constraint classic_encounters_battle_phase_check
    check (battle_phase in ('choose_pokemon', 'initiative', 'active', 'finished')),
  add constraint classic_encounters_active_side_check
    check (active_side is null or active_side in ('player', 'opponent')),
  add constraint classic_encounters_action_counts_check
    check (player_actions >= 0 and opponent_actions >= 0 and round_no >= 1);

drop index if exists public.classic_encounters_one_pending_per_player_idx;
create unique index if not exists classic_encounters_one_active_per_player_idx
  on public.classic_encounters(game_id, user_id)
  where status in ('pending', 'in_battle');

create index if not exists classic_encounters_wild_pokemon_idx
  on public.classic_encounters(wild_pokemon_id)
  where wild_pokemon_id is not null;

create index if not exists classic_encounters_player_pokemon_idx
  on public.classic_encounters(player_pokemon_id)
  where player_pokemon_id is not null;

alter table public.classic_campaigns
  alter column settings set default '{"badge_rank_mode":"regional","party_scaling":true,"battle_difficulty":"normal"}'::jsonb;

update public.classic_campaigns
set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{battle_difficulty}', '"normal"'::jsonb, true)
where not coalesce(settings, '{}'::jsonb) ? 'battle_difficulty';

-- In classic games every player controls initiative for their own team and
-- for the temporary wild Pokemon attached to their personal encounter.
drop policy if exists "classic players manage battle initiative" on public.initiative;
create policy "classic players manage battle initiative"
  on public.initiative for all to authenticated
  using (
    public.is_game_member(game_id, auth.uid())
    and exists (
      select 1
      from public.games g
      join public.pokemon p on p.id = initiative.character_ref
      where g.id = initiative.game_id
        and g.narrator_type = 'classic'
        and p.game_id = initiative.game_id
        and p.owner_id = auth.uid()
    )
  )
  with check (
    public.is_game_member(game_id, auth.uid())
    and exists (
      select 1
      from public.games g
      join public.pokemon p on p.id = initiative.character_ref
      where g.id = initiative.game_id
        and g.narrator_type = 'classic'
        and p.game_id = initiative.game_id
        and p.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.classic_encounters to authenticated;
