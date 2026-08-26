-- Map presence is shared with the table even when the underlying sheet is private.
-- Private sheets remain protected by their own RLS policies.
drop policy if exists "members view tokens" on public.tokens;
create policy "members view tokens" on public.tokens
  for select to authenticated
  using (
    public.is_game_narrator(game_id, auth.uid())
    or (
      public.is_game_member(game_id, auth.uid())
      and coalesce(layer, 'tokens') <> 'gm'
    )
  );

-- Expose only the values required to resolve a move against a visible map token.
-- This avoids granting players read access to another player's complete sheet.
create or replace function public.get_move_target_info(
  p_game_id uuid,
  p_page_id uuid
)
returns table (
  token_id uuid,
  character_id uuid,
  character_kind text,
  target_name text,
  token_owner_id uuid,
  character_owner_id uuid,
  allowed_editors uuid[],
  vitality integer,
  insight integer,
  target_types text[],
  clash_pool integer,
  evade_pool integer,
  current_hp integer,
  max_hp integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.id as token_id,
    p.id as character_id,
    'pokemon'::text as character_kind,
    t.label as target_name,
    t.owner_id as token_owner_id,
    p.owner_id as character_owner_id,
    coalesce(p.allowed_editors, '{}'::uuid[]) as allowed_editors,
    greatest(
      0,
      coalesce((p.current_attrs ->> 'vitality')::integer, (s.base_attrs ->> 'vitality')::integer, 1)
        + coalesce((p.modifiers ->> '_def_bonus')::integer, 0)
    ) as vitality,
    greatest(
      0,
      coalesce((p.current_attrs ->> 'insight')::integer, (s.base_attrs ->> 'insight')::integer, 1)
        + coalesce((p.modifiers ->> '_spdef_bonus')::integer, 0)
    ) as insight,
    coalesce(s.types::text[], '{}'::text[]) as target_types,
    greatest(
      0,
      coalesce((p.current_attrs ->> 'strength')::integer, (s.base_attrs ->> 'strength')::integer, 1)
        + coalesce((p.skills ->> 'Clash')::integer, 0)
    ) as clash_pool,
    greatest(
      0,
      coalesce((p.current_attrs ->> 'dexterity')::integer, (s.base_attrs ->> 'dexterity')::integer, 1)
        + coalesce((p.skills ->> 'Evasion')::integer, 0)
    ) as evade_pool,
    coalesce(p.current_hp, p.hp) as current_hp,
    p.hp as max_hp
  from public.tokens t
  join public.pokemon p
    on t.character_kind = 'pokemon'
   and p.id = t.character_id
   and p.game_id = t.game_id
  left join public.species s on s.id = p.species_id
  where t.game_id = p_game_id
    and t.page_id = p_page_id
    and coalesce(t.layer, 'tokens') = 'tokens'
    and (
      public.is_game_narrator(t.game_id, auth.uid())
      or public.is_game_member(t.game_id, auth.uid())
    )

  union all

  select
    t.id as token_id,
    tr.id as character_id,
    'trainer'::text as character_kind,
    t.label as target_name,
    t.owner_id as token_owner_id,
    tr.owner_id as character_owner_id,
    coalesce(tr.allowed_editors, '{}'::uuid[]) as allowed_editors,
    greatest(
      0,
      1
        + coalesce((tr.attr_points ->> 'vitality')::integer, 0)
        + coalesce((tr.attr_bonus ->> 'vitality')::integer, 0)
    ) as vitality,
    greatest(
      0,
      1
        + coalesce((tr.attr_points ->> 'insight')::integer, 0)
        + coalesce((tr.attr_bonus ->> 'insight')::integer, 0)
    ) as insight,
    '{}'::text[] as target_types,
    greatest(
      0,
      1
        + coalesce((tr.attr_points ->> 'strength')::integer, 0)
        + coalesce((tr.attr_bonus ->> 'strength')::integer, 0)
        + coalesce((tr.skills ->> 'Clash')::integer, (tr.skills ->> 'Brawl')::integer, 0)
    ) as clash_pool,
    greatest(
      0,
      1
        + coalesce((tr.attr_points ->> 'dexterity')::integer, 0)
        + coalesce((tr.attr_bonus ->> 'dexterity')::integer, 0)
        + coalesce((tr.skills ->> 'Evasion')::integer, 0)
    ) as evade_pool,
    coalesce(
      tr.current_hp,
      5
        + coalesce((tr.attr_points ->> 'vitality')::integer, 0)
        + coalesce((tr.attr_bonus ->> 'vitality')::integer, 0)
    ) as current_hp,
    5
      + coalesce((tr.attr_points ->> 'vitality')::integer, 0)
      + coalesce((tr.attr_bonus ->> 'vitality')::integer, 0) as max_hp
  from public.tokens t
  join public.trainers tr
    on t.character_kind = 'trainer'
   and tr.id = t.character_id
   and tr.game_id = t.game_id
  where t.game_id = p_game_id
    and t.page_id = p_page_id
    and coalesce(t.layer, 'tokens') = 'tokens'
    and (
      public.is_game_narrator(t.game_id, auth.uid())
      or public.is_game_member(t.game_id, auth.uid())
    );
$$;

revoke all on function public.get_move_target_info(uuid, uuid) from public;
grant execute on function public.get_move_target_info(uuid, uuid) to authenticated;

comment on function public.get_move_target_info(uuid, uuid) is
  'Returns the minimum combat snapshot required to target visible Pokemon and trainer tokens.';

notify pgrst, 'reload schema';
