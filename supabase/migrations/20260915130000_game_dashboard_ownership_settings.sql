alter table public.games
  add column if not exists owner_id uuid references auth.users(id) on delete restrict;

update public.games
set owner_id = narrator_id
where owner_id is null;

alter table public.games
  alter column owner_id set not null,
  alter column owner_id set default auth.uid();

create or replace function public.is_game_owner(_game uuid, _user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.games
    where id = _game and owner_id = _user
  );
$$;

revoke all on function public.is_game_owner(uuid, uuid) from public, anon;
grant execute on function public.is_game_owner(uuid, uuid) to authenticated;

drop policy if exists "narrator updates game" on public.games;
create policy "owner or narrator updates game"
on public.games for update to authenticated
using (owner_id = (select auth.uid()) or narrator_id = (select auth.uid()))
with check (owner_id is not null and narrator_id is not null);

drop policy if exists "narrator deletes game" on public.games;
create policy "owner deletes game"
on public.games for delete to authenticated
using (owner_id = (select auth.uid()));

create or replace function public.update_game_dashboard_settings(
  p_game_id uuid,
  p_name text,
  p_system text,
  p_owner_id uuid,
  p_narrator_id uuid
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_game public.games;
  v_previous_narrator uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into v_game
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'Game not found';
  end if;

  if v_user <> v_game.owner_id and v_user <> v_game.narrator_id then
    raise exception 'Only the owner or narrator can change game settings';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Game name is required';
  end if;

  if not exists (
    select 1 from public.game_members
    where game_id = p_game_id and user_id = p_owner_id
  ) then
    raise exception 'The selected owner must be a game member';
  end if;

  if not exists (
    select 1 from public.game_members
    where game_id = p_game_id and user_id = p_narrator_id
  ) then
    raise exception 'The selected narrator must be a game member';
  end if;

  v_previous_narrator := v_game.narrator_id;

  update public.games
  set name = btrim(p_name),
      system = p_system,
      owner_id = p_owner_id,
      narrator_id = p_narrator_id
  where id = p_game_id
  returning * into v_game;

  update public.game_members
  set role = 'player'
  where game_id = p_game_id
    and user_id = v_previous_narrator
    and user_id <> p_narrator_id;

  update public.game_members
  set role = case when user_id = p_narrator_id then 'narrator' else role end
  where game_id = p_game_id
    and user_id in (p_owner_id, p_narrator_id);

  return v_game;
end;
$$;

revoke all on function public.update_game_dashboard_settings(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.update_game_dashboard_settings(uuid, text, text, uuid, uuid) to authenticated;

grant select (owner_id) on public.games to authenticated;
