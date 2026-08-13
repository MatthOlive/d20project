-- Pokemon Classic mode: finish trainer battles and settle rewards atomically.

create or replace function public.finish_classic_trainer_battle(
  p_encounter_id uuid,
  p_result text,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_encounter record;
  v_progress record;
  v_player_rank text;
  v_opponent_rank text;
  v_player_index integer;
  v_opponent_index integer;
  v_difference integer;
  v_multiplier integer := 1;
  v_base integer;
  v_amount integer;
  v_delta integer;
  v_new_money integer;
  v_actual_amount integer;
  v_settlement jsonb;
  v_reward jsonb;
  v_rewards jsonb;
  v_victory_total integer := 0;
begin
  select id, game_id, user_id, status, metadata
    into v_encounter
  from public.classic_encounters
  where id = p_encounter_id
  for update;

  if not found or v_encounter.user_id <> auth.uid() then
    raise exception 'Batalha classica nao encontrada.';
  end if;

  if coalesce(v_encounter.metadata ->> 'opponent_kind', '') <> 'trainer' then
    raise exception 'Este encontro nao e uma batalha contra treinador.';
  end if;

  if coalesce((v_encounter.metadata ->> 'money_settled')::boolean, false) then
    return v_encounter.metadata -> 'money_reward';
  end if;

  if v_encounter.status in ('pending', 'in_battle') then
    if p_result not in ('won', 'lost') then
      raise exception 'Resultado de batalha invalido.';
    end if;
  elsif v_encounter.status in ('won', 'lost') then
    p_result := v_encounter.status;
  else
    raise exception 'A batalha ja foi encerrada.';
  end if;

  p_metadata := coalesce(p_metadata, v_encounter.metadata, '{}'::jsonb);
  if jsonb_typeof(p_metadata -> 'pending_victory_rewards') = 'array' then
    v_rewards := p_metadata -> 'pending_victory_rewards';
  else
    v_rewards := '[]'::jsonb;
  end if;

  select p.money, p.trainer_id, t.rank::text as trainer_rank
    into v_progress
  from public.classic_player_progress p
  left join public.trainers t on t.id = p.trainer_id
  where p.game_id = v_encounter.game_id
    and p.user_id = auth.uid()
  for update of p;

  if not found then
    raise exception 'Progresso classico nao encontrado.';
  end if;

  for v_reward in select value from jsonb_array_elements(v_rewards)
  loop
    if coalesce((v_reward ->> 'amount')::integer, 0) > 0 then
      update public.pokemon
      set victories = coalesce(victories, 0) + (v_reward ->> 'amount')::integer
      where id = (v_reward ->> 'pokemon_id')::uuid
        and game_id = v_encounter.game_id
        and owner_id = auth.uid()
        and owner_trainer_id = v_progress.trainer_id;
      if found then
        v_victory_total := v_victory_total + (v_reward ->> 'amount')::integer;
      end if;
    end if;
  end loop;

  v_player_rank := coalesce(v_progress.trainer_rank, 'starter');
  v_opponent_rank := coalesce(p_metadata ->> 'opponent_trainer_rank', 'starter');

  v_player_index := case lower(v_player_rank)
    when 'starter' then 0 when 'beginner' then 1 when 'begginer' then 1
    when 'amateur' then 2 when 'ace' then 3 when 'pro' then 4
    when 'champion' then 5 when 'campeao' then 5 when 'master' then 6 else 0 end;
  v_opponent_index := case lower(v_opponent_rank)
    when 'starter' then 0 when 'beginner' then 1 when 'begginer' then 1
    when 'amateur' then 2 when 'ace' then 3 when 'pro' then 4
    when 'champion' then 5 when 'campeao' then 5 when 'master' then 6 else 0 end;
  v_difference := v_opponent_index - v_player_index;
  if abs(v_difference) > 1 then v_multiplier := 2; end if;

  if p_result = 'won' then
    v_base := 300 * (v_opponent_index + 1);
    v_amount := v_base * v_multiplier;
    v_delta := v_amount;
  else
    v_base := case v_player_index
      when 0 then 30 when 1 then 150 when 2 then 300 when 3 then 600
      when 4 then 1500 when 5 then 3000 else 6000 end;
    v_amount := v_base * v_multiplier;
    v_delta := -v_amount;
  end if;

  v_new_money := greatest(0, v_progress.money + v_delta);
  v_actual_amount := case when v_delta < 0 then v_progress.money - v_new_money else v_amount end;
  update public.classic_player_progress
  set money = v_new_money,
      updated_at = now()
  where game_id = v_encounter.game_id
    and user_id = auth.uid();

  v_settlement := jsonb_build_object(
    'operation', case when v_delta > 0 then 'gain' else 'loss' end,
    'amount', v_actual_amount,
    'calculated_amount', v_amount,
    'base', v_base,
    'difference_multiplier', v_multiplier,
    'rank_difference', v_difference,
    'previous_money', v_progress.money,
    'new_money', v_new_money,
    'player_trainer_rank', v_player_rank,
    'opponent_trainer_rank', v_opponent_rank,
    'victories_applied', v_victory_total
  );

  update public.classic_encounters
  set status = p_result,
      battle_phase = 'finished',
      active_side = null,
      resolved_at = now(),
      metadata = p_metadata || jsonb_build_object(
        'awaiting_player_switch', false,
        'replacement_next_side', null,
        'replacement_advances_round', false,
        'money_settled', true,
        'money_reward', v_settlement,
        'victories_settled', true,
        'victories_applied', v_victory_total
      )
  where id = p_encounter_id;

  return v_settlement;
end;
$$;

revoke all on function public.finish_classic_trainer_battle(uuid, text, jsonb) from public;
grant execute on function public.finish_classic_trainer_battle(uuid, text, jsonb) to authenticated;
