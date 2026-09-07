-- Share reaction-use limits with combat clients without exposing private sheets.
drop function if exists public.get_move_target_info(uuid, uuid);
create function public.get_move_target_info(p_game_id uuid, p_page_id uuid)
returns table (
  token_id uuid, character_id uuid, character_kind text, target_name text,
  token_owner_id uuid, character_owner_id uuid, allowed_editors uuid[],
  vitality integer, insight integer, target_types text[], clash_pool integer,
  evade_pool integer, clash_times integer, evasion_times integer,
  current_hp integer, max_hp integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, p.id, 'pokemon'::text, t.label, t.owner_id, p.owner_id,
    coalesce(p.allowed_editors, '{}'::uuid[]),
    greatest(0, coalesce((p.current_attrs->>'vitality')::integer, (s.base_attrs->>'vitality')::integer, 1) + coalesce((p.modifiers->>'_def_bonus')::integer, 0)),
    greatest(0, coalesce((p.current_attrs->>'insight')::integer, (s.base_attrs->>'insight')::integer, 1) + coalesce((p.modifiers->>'_spdef_bonus')::integer, 0)),
    coalesce(s.types::text[], '{}'::text[]),
    greatest(0, coalesce((p.current_attrs->>'strength')::integer, (s.base_attrs->>'strength')::integer, 1) + coalesce((p.skills->>'Clash')::integer, 0)),
    greatest(0, coalesce((p.current_attrs->>'dexterity')::integer, (s.base_attrs->>'dexterity')::integer, 1) + coalesce((p.skills->>'Evasion')::integer, 0)),
    greatest(0, 1 + coalesce((p.attr_bonus->>'clash_times')::integer, 0)),
    greatest(0, 1 + coalesce((p.attr_bonus->>'evasion_times')::integer, 0)),
    coalesce(p.current_hp, p.hp), p.hp
  from public.tokens t join public.pokemon p on t.character_kind='pokemon' and p.id=t.character_id and p.game_id=t.game_id
  left join public.species s on s.id=p.species_id
  where t.game_id=p_game_id and t.page_id=p_page_id and coalesce(t.layer,'tokens')='tokens' and public.is_game_member(t.game_id, auth.uid())
  union all
  select t.id, tr.id, 'trainer'::text, t.label, t.owner_id, tr.owner_id,
    coalesce(tr.allowed_editors, '{}'::uuid[]),
    greatest(0, 1 + coalesce((tr.attr_points->>'vitality')::integer,0) + coalesce((tr.attr_bonus->>'vitality')::integer,0)),
    greatest(0, 1 + coalesce((tr.attr_points->>'insight')::integer,0) + coalesce((tr.attr_bonus->>'insight')::integer,0)),
    '{}'::text[],
    greatest(0, 1 + coalesce((tr.attr_points->>'strength')::integer,0) + coalesce((tr.attr_bonus->>'strength')::integer,0) + coalesce((tr.skills->>'Clash')::integer,(tr.skills->>'Brawl')::integer,0)),
    greatest(0, 1 + coalesce((tr.attr_points->>'dexterity')::integer,0) + coalesce((tr.attr_bonus->>'dexterity')::integer,0) + coalesce((tr.skills->>'Evasion')::integer,0)),
    greatest(0, 1 + coalesce((tr.attr_bonus->>'clash_times')::integer,0)),
    greatest(0, 1 + coalesce((tr.attr_bonus->>'evasion_times')::integer,0)),
    coalesce(tr.current_hp, 5 + coalesce((tr.attr_points->>'vitality')::integer,0) + coalesce((tr.attr_bonus->>'vitality')::integer,0)),
    5 + coalesce((tr.attr_points->>'vitality')::integer,0) + coalesce((tr.attr_bonus->>'vitality')::integer,0)
  from public.tokens t join public.trainers tr on t.character_kind='trainer' and tr.id=t.character_id and tr.game_id=t.game_id
  where t.game_id=p_game_id and t.page_id=p_page_id and coalesce(t.layer,'tokens')='tokens' and public.is_game_member(t.game_id, auth.uid());
$$;
revoke all on function public.get_move_target_info(uuid, uuid) from public;
grant execute on function public.get_move_target_info(uuid, uuid) to authenticated;

drop function if exists public.get_digirole_target_info(uuid, uuid);
create function public.get_digirole_target_info(p_game_id uuid, p_page_id uuid)
returns table (
  token_id uuid, character_id uuid, character_kind text, target_name text,
  character_owner_id uuid, def integer, res integer, target_fields text[],
  digi_attribute text, clash_physical integer, clash_energy integer, evade_pool integer,
  clash_times integer, evasion_times integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  select tok.id,d.id,'digirole_digimon'::text,coalesce(nullif(d.nickname,''),s.name,tok.label,'Digimon'),d.owner_id,
    greatest(0,coalesce((d.attrs->>'vitality')::integer,0)+coalesce((d.attr_points->>'vitality')::integer,0)+coalesce((d.bonuses->>'vitality')::integer,0)),
    greatest(0,coalesce((d.attrs->>'wisdom')::integer,0)+coalesce((d.attr_points->>'wisdom')::integer,0)+coalesce((d.bonuses->>'wisdom')::integer,0)),coalesce(s.fields,'{}'::text[]),coalesce(s.digi_attribute,'None'),
    greatest(0,coalesce((d.attrs->>'strength')::integer,0)+coalesce((d.attr_points->>'strength')::integer,0)+coalesce((d.bonuses->>'strength')::integer,0)+coalesce((d.skills->>'Clash')::integer,0)+coalesce((d.bonuses->>'clash')::integer,0)),
    greatest(0,coalesce((d.attrs->>'spirit')::integer,0)+coalesce((d.attr_points->>'spirit')::integer,0)+coalesce((d.bonuses->>'spirit')::integer,0)+coalesce((d.skills->>'Clash')::integer,0)+coalesce((d.bonuses->>'clash')::integer,0)),
    greatest(0,coalesce((d.attrs->>'dexterity')::integer,0)+coalesce((d.attr_points->>'dexterity')::integer,0)+coalesce((d.bonuses->>'dexterity')::integer,0)+coalesce((d.skills->>'Evasion')::integer,0)+coalesce((d.bonuses->>'evasion')::integer,0)),
    greatest(0,1+coalesce((d.bonuses->>'clash_times')::integer,0)),greatest(0,1+coalesce((d.bonuses->>'evasion_times')::integer,0))
  from public.tokens tok join public.digirole_digimons d on d.id=tok.character_id and d.game_id=tok.game_id left join public.digirole_species s on s.id=d.species_id
  where tok.game_id=p_game_id and tok.page_id=p_page_id and coalesce(tok.layer,'tokens')='tokens' and public.is_game_member(p_game_id,auth.uid())
  union all
  select tok.id,t.id,'digirole_tamer'::text,coalesce(nullif(t.name,''),tok.label,'Tamer'),t.owner_id,
    greatest(0,coalesce(((coalesce(hs.base_attrs,t.attrs))->>'vitality')::integer,0)+coalesce((t.attr_points->>'vitality')::integer,0)+coalesce((t.bonuses->>'vitality')::integer,0)),
    greatest(0,coalesce(((coalesce(hs.base_attrs,t.attrs))->>'wisdom')::integer,0)+coalesce((t.attr_points->>'wisdom')::integer,0)+coalesce((t.bonuses->>'wisdom')::integer,0)),coalesce(hs.fields,'{}'::text[]),coalesce(hs.digi_attribute,'None'),
    greatest(0,coalesce(((coalesce(hs.base_attrs,t.attrs))->>'strength')::integer,0)+coalesce((t.attr_points->>'strength')::integer,0)+coalesce((t.bonuses->>'strength')::integer,0)+coalesce((t.skills->>'Clash')::integer,0)+coalesce((t.bonuses->>'clash')::integer,0)),
    greatest(0,coalesce(((coalesce(hs.base_attrs,t.attrs))->>'spirit')::integer,0)+coalesce((t.attr_points->>'spirit')::integer,0)+coalesce((t.bonuses->>'spirit')::integer,0)+coalesce((t.skills->>'Clash')::integer,0)+coalesce((t.bonuses->>'clash')::integer,0)),
    greatest(0,coalesce(((coalesce(hs.base_attrs,t.attrs))->>'dexterity')::integer,0)+coalesce((t.attr_points->>'dexterity')::integer,0)+coalesce((t.bonuses->>'dexterity')::integer,0)+coalesce((t.skills->>'Evasion')::integer,0)+coalesce((t.bonuses->>'evasion')::integer,0)),
    greatest(0,1+coalesce((t.bonuses->>'clash_times')::integer,0)),greatest(0,1+coalesce((t.bonuses->>'evasion_times')::integer,0))
  from public.tokens tok join public.digirole_tamers t on t.id=tok.character_id and t.game_id=tok.game_id
  left join public.digirole_species hs on hs.id=case when coalesce(t.hybrid_state->>'speciesId','')~*'^[0-9a-f-]{36}$' then (t.hybrid_state->>'speciesId')::uuid else null end
  where tok.game_id=p_game_id and tok.page_id=p_page_id and coalesce(tok.layer,'tokens')='tokens' and public.is_game_member(p_game_id,auth.uid());
$$;
revoke all on function public.get_digirole_target_info(uuid, uuid) from public;
grant execute on function public.get_digirole_target_info(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
