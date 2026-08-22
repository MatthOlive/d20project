begin;

-- Convert old Classic campaigns into ordinary human-narrated tables before
-- restoring the supported narrator type constraint.
update public.games
set narrator_type = 'human'
where narrator_type = 'classic';

alter table public.games
  drop constraint if exists games_narrator_type_check;

alter table public.games
  add constraint games_narrator_type_check
  check (narrator_type in ('human', 'ai'));

-- Remove the restrictions that Classic mode attached to normal map and roster
-- operations. These must go before their helper functions are dropped.
drop trigger if exists enforce_classic_token_rank on public.tokens;
drop trigger if exists enforce_classic_team_rank on public.pokemon;
drop policy if exists "classic players manage battle initiative" on public.initiative;

drop function if exists public.create_classic_battle_encounter(uuid, text, integer, integer, jsonb, jsonb);
drop function if exists public.finish_classic_trainer_battle(uuid, text, jsonb);
drop function if exists public.claim_classic_bedroom_potion(uuid);
drop function if exists public.classic_heal_party_at_center(uuid);
drop function if exists public.classic_heal_party_at_home(uuid);
drop function if exists public.enforce_classic_token_rank();
drop function if exists public.enforce_classic_team_rank();
drop function if exists public.classic_rank_allowed(uuid, uuid, public.pokerole_rank);

-- Classic battles generated disposable opponents in the shared Pokemon table.
-- Remove only those generated records and any map/initiative references to them.
delete from public.initiative
where character_ref in (
  select id
  from public.pokemon
  where ai_scene_id like 'classic_battle:%'
     or folder = '__classic_battle__'
);

delete from public.tokens
where character_kind = 'pokemon'
  and character_id in (
    select id
    from public.pokemon
    where ai_scene_id like 'classic_battle:%'
       or folder = '__classic_battle__'
  );

delete from public.pokemon
where ai_scene_id like 'classic_battle:%'
   or folder = '__classic_battle__';

drop table if exists public.classic_encounters cascade;
drop table if exists public.classic_player_progress cascade;
drop table if exists public.classic_campaigns cascade;

alter table public.games
  drop constraint if exists games_classic_region_check,
  drop column if exists classic_region,
  drop column if exists classic_start_city;

commit;
