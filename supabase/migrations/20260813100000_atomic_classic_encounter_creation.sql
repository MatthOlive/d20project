-- Creates every temporary opponent and the encounter in one transaction.
-- This avoids partial battles and keeps classic-mode writes independent from
-- ordinary character RLS policies while still validating the signed-in player.

create or replace function public.create_classic_battle_encounter(
  p_game_id uuid,
  p_scene text,
  p_tile_x integer,
  p_tile_y integer,
  p_team jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_member jsonb;
  v_pokemon_id uuid;
  v_first_pokemon_id uuid;
  v_first_species_id uuid;
  v_first_rank public.pokerole_rank;
  v_team_ids jsonb := '[]'::jsonb;
  v_encounter_id uuid;
  v_move_id_text text;
begin
  if v_user_id is null then
    raise exception 'Voce precisa estar conectado para iniciar uma batalha.';
  end if;

  if not public.is_game_member(p_game_id, v_user_id) then
    raise exception 'Voce nao participa desta mesa.';
  end if;

  if not exists (
    select 1 from public.games
    where id = p_game_id and narrator_type = 'classic'
  ) then
    raise exception 'Esta mesa nao esta no modo classico.';
  end if;

  if jsonb_typeof(p_team) <> 'array' or jsonb_array_length(p_team) = 0 then
    raise exception 'A equipe do oponente esta vazia.';
  end if;

  if exists (
    select 1
    from public.classic_encounters
    where game_id = p_game_id
      and user_id = v_user_id
      and status in ('pending', 'in_battle')
  ) then
    raise exception 'Ja existe uma batalha ativa para este jogador.';
  end if;

  for v_member in select value from jsonb_array_elements(p_team)
  loop
    if not exists (
      select 1 from public.species where id = (v_member ->> 'species_id')::uuid
    ) then
      raise exception 'Uma especie da equipe do oponente nao existe no catalogo.';
    end if;

    insert into public.pokemon (
      game_id,
      owner_id,
      species_id,
      nickname,
      rank,
      ai_spawned,
      ai_scene_id,
      folder,
      current_attrs,
      attr_points,
      social_attrs,
      social_attr_points,
      skills,
      modifiers,
      sex,
      nature,
      confidence,
      hp,
      will,
      current_hp,
      current_will
    ) values (
      p_game_id,
      v_user_id,
      (v_member ->> 'species_id')::uuid,
      nullif(v_member ->> 'nickname', ''),
      (v_member ->> 'rank')::public.pokerole_rank,
      true,
      'classic_battle:preparing',
      '__classic_battle__',
      coalesce(v_member -> 'current_attrs', '{}'::jsonb),
      coalesce(v_member -> 'attr_points', '{}'::jsonb),
      coalesce(v_member -> 'social_attrs', '{}'::jsonb),
      coalesce(v_member -> 'social_attr_points', '{}'::jsonb),
      coalesce(v_member -> 'skills', '{}'::jsonb),
      coalesce(v_member -> 'modifiers', '{}'::jsonb),
      nullif(v_member ->> 'sex', ''),
      nullif(v_member ->> 'nature', ''),
      coalesce((v_member ->> 'confidence')::integer, 0),
      coalesce((v_member ->> 'hp')::integer, 0),
      coalesce((v_member ->> 'will')::integer, 0),
      coalesce((v_member ->> 'hp')::integer, 0),
      coalesce((v_member ->> 'will')::integer, 0)
    )
    returning id into v_pokemon_id;

    if v_first_pokemon_id is null then
      v_first_pokemon_id := v_pokemon_id;
      v_first_species_id := (v_member ->> 'species_id')::uuid;
      v_first_rank := (v_member ->> 'rank')::public.pokerole_rank;
    end if;

    v_team_ids := v_team_ids || jsonb_build_array(v_pokemon_id);

    if jsonb_typeof(v_member -> 'move_ids') = 'array' then
      for v_move_id_text in select jsonb_array_elements_text(v_member -> 'move_ids')
      loop
        insert into public.pokemon_moves (pokemon_id, move_id)
        values (v_pokemon_id, v_move_id_text::uuid)
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  insert into public.classic_encounters (
    game_id,
    user_id,
    scene,
    species_id,
    rank,
    wild_pokemon_id,
    tile_x,
    tile_y,
    metadata
  ) values (
    p_game_id,
    v_user_id,
    p_scene,
    v_first_species_id,
    v_first_rank,
    v_first_pokemon_id,
    p_tile_x,
    p_tile_y,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('opponent_team_ids', v_team_ids)
  )
  returning id into v_encounter_id;

  update public.pokemon
  set ai_scene_id = 'classic_battle:' || v_encounter_id::text
  where id in (
    select team_id::uuid
    from jsonb_array_elements_text(v_team_ids) as team(team_id)
  );

  return v_encounter_id;
end;
$$;

revoke all on function public.create_classic_battle_encounter(uuid, text, integer, integer, jsonb, jsonb) from public;
grant execute on function public.create_classic_battle_encounter(uuid, text, integer, integer, jsonb, jsonb) to authenticated;
