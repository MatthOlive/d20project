-- Pokemon Classic mode: Pallet house interiors and atomic home interactions.

alter table public.classic_player_progress
  drop constraint if exists classic_player_progress_world_scene_check;

alter table public.classic_player_progress
  add constraint classic_player_progress_world_scene_check
  check (world_scene in (
    'bedroom',
    'player_house_1f',
    'rival_house_1f',
    'rival_bedroom',
    'pallet',
    'lab',
    'route_1'
  ));

create or replace function public.claim_classic_bedroom_potion(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trainer_id uuid;
  v_flags jsonb;
  v_potions jsonb;
  v_potion jsonb;
  v_count integer;
begin
  select trainer_id, coalesce(story_flags, '{}'::jsonb)
    into v_trainer_id, v_flags
  from public.classic_player_progress
  where game_id = p_game_id
    and user_id = auth.uid()
  for update;

  if v_trainer_id is null then
    raise exception 'Treinador do modo clássico não encontrado.';
  end if;

  if v_flags @> '{"bedroom_potion_taken": true}'::jsonb then
    raise exception 'A Potion inicial já foi retirada.';
  end if;

  select coalesce(potions, '{}'::jsonb)
    into v_potions
  from public.trainers
  where id = v_trainer_id
    and game_id = p_game_id
  for update;

  if not found then
    raise exception 'Ficha de treinador não encontrada.';
  end if;

  v_potion := coalesce(v_potions -> 'potion', '{"count": 0, "used": 0, "max": 2}'::jsonb);
  v_count := coalesce((v_potion ->> 'count')::integer, 0) + 1;
  v_potion := jsonb_set(v_potion, '{count}', to_jsonb(v_count), true);
  v_potion := jsonb_set(v_potion, '{used}', to_jsonb(coalesce((v_potion ->> 'used')::integer, 0)), true);
  v_potion := jsonb_set(v_potion, '{max}', to_jsonb(coalesce((v_potion ->> 'max')::integer, 2)), true);

  update public.trainers
  set potions = jsonb_set(v_potions, '{potion}', v_potion, true)
  where id = v_trainer_id;

  update public.classic_player_progress
  set story_flags = v_flags || '{"bedroom_potion_taken": true}'::jsonb,
      updated_at = now()
  where game_id = p_game_id
    and user_id = auth.uid();

  return jsonb_build_object('claimed', true, 'item', 'potion', 'count', v_count);
end;
$$;

create or replace function public.classic_heal_party_at_home(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trainer_id uuid;
  v_healed integer;
begin
  select trainer_id
    into v_trainer_id
  from public.classic_player_progress
  where game_id = p_game_id
    and user_id = auth.uid();

  if v_trainer_id is null then
    raise exception 'Treinador do modo clássico não encontrado.';
  end if;

  update public.pokemon
  set current_hp = hp
  where game_id = p_game_id
    and owner_trainer_id = v_trainer_id
    and team_slot between 1 and 6
    and hp is not null;

  get diagnostics v_healed = row_count;
  return v_healed;
end;
$$;

revoke all on function public.claim_classic_bedroom_potion(uuid) from public;
revoke all on function public.classic_heal_party_at_home(uuid) from public;
grant execute on function public.claim_classic_bedroom_potion(uuid) to authenticated;
grant execute on function public.classic_heal_party_at_home(uuid) to authenticated;
