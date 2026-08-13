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
    raise exception 'Treinador do modo classico nao encontrado.';
  end if;

  update public.pokemon
  set current_hp = hp,
      status = '{}'::text[]
  where game_id = p_game_id
    and owner_trainer_id = v_trainer_id
    and team_slot between 1 and 6
    and hp is not null;

  get diagnostics v_healed = row_count;
  return v_healed;
end;
$$;

revoke all on function public.classic_heal_party_at_home(uuid) from public;
grant execute on function public.classic_heal_party_at_home(uuid) to authenticated;

create or replace function public.classic_heal_party_at_center(p_game_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select public.classic_heal_party_at_home(p_game_id);
$$;

revoke all on function public.classic_heal_party_at_center(uuid) from public;
grant execute on function public.classic_heal_party_at_center(uuid) to authenticated;
