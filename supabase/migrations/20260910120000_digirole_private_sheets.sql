-- DigiRole sheets are private to their creator and the game narrator.
drop policy if exists "members view digirole tamers" on public.digirole_tamers;
drop policy if exists "controllers update digirole tamers" on public.digirole_tamers;
drop policy if exists "controllers delete digirole tamers" on public.digirole_tamers;
create policy "owners and narrators view digirole tamers" on public.digirole_tamers
for select to authenticated using (
  owner_id = auth.uid() or public.is_game_narrator(game_id, auth.uid())
);
create policy "owners and narrators update digirole tamers" on public.digirole_tamers
for update to authenticated using (
  owner_id = auth.uid() or public.is_game_narrator(game_id, auth.uid())
) with check (
  owner_id = auth.uid() or public.is_game_narrator(game_id, auth.uid())
);
create policy "owners and narrators delete digirole tamers" on public.digirole_tamers
for delete to authenticated using (
  owner_id = auth.uid() or public.is_game_narrator(game_id, auth.uid())
);

drop policy if exists "members view digirole digimons" on public.digirole_digimons;
drop policy if exists "controllers update digirole digimons" on public.digirole_digimons;
drop policy if exists "controllers delete digirole digimons" on public.digirole_digimons;
create policy "owners and narrators view digirole digimons" on public.digirole_digimons
for select to authenticated using (
  owner_id = auth.uid() or public.is_game_narrator(game_id, auth.uid())
);
create policy "owners and narrators update digirole digimons" on public.digirole_digimons
for update to authenticated using (
  owner_id = auth.uid() or public.is_game_narrator(game_id, auth.uid())
) with check (
  owner_id = auth.uid() or public.is_game_narrator(game_id, auth.uid())
);
create policy "owners and narrators delete digirole digimons" on public.digirole_digimons
for delete to authenticated using (
  owner_id = auth.uid() or public.is_game_narrator(game_id, auth.uid())
);

drop policy if exists "members view digirole learned techniques" on public.digirole_digimon_techniques;
drop policy if exists "controllers manage digirole learned techniques" on public.digirole_digimon_techniques;
create policy "owners and narrators view digirole learned techniques" on public.digirole_digimon_techniques
for select to authenticated using (exists (
  select 1 from public.digirole_digimons d where d.id = digimon_id
  and (d.owner_id = auth.uid() or public.is_game_narrator(d.game_id, auth.uid()))
));
create policy "owners and narrators manage digirole learned techniques" on public.digirole_digimon_techniques
for all to authenticated using (exists (
  select 1 from public.digirole_digimons d where d.id = digimon_id
  and (d.owner_id = auth.uid() or public.is_game_narrator(d.game_id, auth.uid()))
)) with check (exists (
  select 1 from public.digirole_digimons d where d.id = digimon_id
  and (d.owner_id = auth.uid() or public.is_game_narrator(d.game_id, auth.uid()))
));

drop policy if exists "members view digirole forms" on public.digirole_forms;
drop policy if exists "controllers manage digirole forms" on public.digirole_forms;
create policy "owners and narrators view digirole forms" on public.digirole_forms
for select to authenticated using (exists (
  select 1 from public.digirole_digimons d where d.id = digimon_id
  and (d.owner_id = auth.uid() or public.is_game_narrator(d.game_id, auth.uid()))
));
create policy "owners and narrators manage digirole forms" on public.digirole_forms
for all to authenticated using (exists (
  select 1 from public.digirole_digimons d where d.id = digimon_id
  and (d.owner_id = auth.uid() or public.is_game_narrator(d.game_id, auth.uid()))
)) with check (exists (
  select 1 from public.digirole_digimons d where d.id = digimon_id
  and (d.owner_id = auth.uid() or public.is_game_narrator(d.game_id, auth.uid()))
));

drop policy if exists "members view digirole scans" on public.digirole_scan_data;
drop policy if exists "controllers manage digirole scans" on public.digirole_scan_data;
create policy "owners and narrators view digirole scans" on public.digirole_scan_data
for select to authenticated using (exists (
  select 1 from public.digirole_tamers t where t.id = tamer_id
  and (t.owner_id = auth.uid() or public.is_game_narrator(t.game_id, auth.uid()))
));
create policy "owners and narrators manage digirole scans" on public.digirole_scan_data
for all to authenticated using (exists (
  select 1 from public.digirole_tamers t where t.id = tamer_id
  and (t.owner_id = auth.uid() or public.is_game_narrator(t.game_id, auth.uid()))
)) with check (exists (
  select 1 from public.digirole_tamers t where t.id = tamer_id
  and (t.owner_id = auth.uid() or public.is_game_narrator(t.game_id, auth.uid()))
));

-- Tokens remain visible on the shared map, but only the sheet owner or narrator may change them.
create or replace function public.is_digirole_character(p_character_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.digirole_tamers where id = p_character_id)
    or exists(select 1 from public.digirole_digimons where id = p_character_id);
$$;
create or replace function public.can_control_digirole_character(
  p_game_id uuid,
  p_character_id uuid,
  p_user_id uuid
)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_game_narrator(p_game_id, p_user_id)
    or exists(select 1 from public.digirole_tamers where id = p_character_id and game_id = p_game_id and owner_id = p_user_id)
    or exists(select 1 from public.digirole_digimons where id = p_character_id and game_id = p_game_id and owner_id = p_user_id);
$$;
revoke all on function public.is_digirole_character(uuid) from public;
revoke all on function public.can_control_digirole_character(uuid, uuid, uuid) from public;
grant execute on function public.is_digirole_character(uuid) to authenticated;
grant execute on function public.can_control_digirole_character(uuid, uuid, uuid) to authenticated;

drop policy if exists "owner or narrator inserts tokens" on public.tokens;
drop policy if exists "owner or narrator updates tokens" on public.tokens;
drop policy if exists "owner or narrator deletes tokens" on public.tokens;
create policy "owner or narrator inserts tokens" on public.tokens
for insert to authenticated with check (
  public.can_control_digirole_character(game_id, character_id, auth.uid())
  or (
    not public.is_digirole_character(character_id)
    and public.can_edit_character(game_id, owner_id)
  )
);
create policy "owner or narrator updates tokens" on public.tokens
for update to authenticated using (
  public.can_control_digirole_character(game_id, character_id, auth.uid())
  or (
    not public.is_digirole_character(character_id)
    and public.can_edit_character(game_id, owner_id)
  )
) with check (
  public.can_control_digirole_character(game_id, character_id, auth.uid())
  or (
    not public.is_digirole_character(character_id)
    and public.can_edit_character(game_id, owner_id)
  )
);
create policy "owner or narrator deletes tokens" on public.tokens
for delete to authenticated using (
  public.can_control_digirole_character(game_id, character_id, auth.uid())
  or (
    not public.is_digirole_character(character_id)
    and public.can_edit_character(game_id, owner_id)
  )
);

-- Share only combat-facing values for visible targets, never the complete private sheet.
create or replace function public.get_digirole_target_info(p_game_id uuid, p_page_id uuid)
returns table (
  token_id uuid,
  character_id uuid,
  character_kind text,
  target_name text,
  character_owner_id uuid,
  def integer,
  res integer,
  target_fields text[],
  digi_attribute text,
  clash_physical integer,
  clash_energy integer,
  evade_pool integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    tok.id,
    d.id,
    'digirole_digimon'::text,
    coalesce(nullif(d.nickname, ''), s.name, tok.label, 'Digimon'),
    d.owner_id,
    greatest(0, coalesce((d.attrs->>'vitality')::integer, 0) + coalesce((d.attr_points->>'vitality')::integer, 0) + coalesce((d.bonuses->>'vitality')::integer, 0)),
    greatest(0, coalesce((d.attrs->>'wisdom')::integer, 0) + coalesce((d.attr_points->>'wisdom')::integer, 0) + coalesce((d.bonuses->>'wisdom')::integer, 0)),
    coalesce(s.fields, '{}'::text[]),
    coalesce(s.digi_attribute, 'None'),
    greatest(0, coalesce((d.attrs->>'strength')::integer, 0) + coalesce((d.attr_points->>'strength')::integer, 0) + coalesce((d.bonuses->>'strength')::integer, 0) + coalesce((d.skills->>'Clash')::integer, 0) + coalesce((d.bonuses->>'clash')::integer, 0)),
    greatest(0, coalesce((d.attrs->>'spirit')::integer, 0) + coalesce((d.attr_points->>'spirit')::integer, 0) + coalesce((d.bonuses->>'spirit')::integer, 0) + coalesce((d.skills->>'Clash')::integer, 0) + coalesce((d.bonuses->>'clash')::integer, 0)),
    greatest(0, coalesce((d.attrs->>'dexterity')::integer, 0) + coalesce((d.attr_points->>'dexterity')::integer, 0) + coalesce((d.bonuses->>'dexterity')::integer, 0) + coalesce((d.skills->>'Evasion')::integer, 0) + coalesce((d.bonuses->>'evasion')::integer, 0))
  from public.tokens tok
  join public.digirole_digimons d on d.id = tok.character_id and d.game_id = tok.game_id
  left join public.digirole_species s on s.id = d.species_id
  where tok.game_id = p_game_id and tok.page_id = p_page_id
    and coalesce(tok.layer, 'tokens') = 'tokens'
    and public.is_game_member(p_game_id, auth.uid())
  union all
  select
    tok.id,
    t.id,
    'digirole_tamer'::text,
    coalesce(nullif(t.name, ''), tok.label, 'Tamer'),
    t.owner_id,
    greatest(0, coalesce(((coalesce(hs.base_attrs, t.attrs))->>'vitality')::integer, 0) + coalesce((t.attr_points->>'vitality')::integer, 0) + coalesce((t.bonuses->>'vitality')::integer, 0)),
    greatest(0, coalesce(((coalesce(hs.base_attrs, t.attrs))->>'wisdom')::integer, 0) + coalesce((t.attr_points->>'wisdom')::integer, 0) + coalesce((t.bonuses->>'wisdom')::integer, 0)),
    coalesce(hs.fields, '{}'::text[]),
    coalesce(hs.digi_attribute, 'None'),
    greatest(0, coalesce(((coalesce(hs.base_attrs, t.attrs))->>'strength')::integer, 0) + coalesce((t.attr_points->>'strength')::integer, 0) + coalesce((t.bonuses->>'strength')::integer, 0) + coalesce((t.skills->>'Clash')::integer, 0) + coalesce((t.bonuses->>'clash')::integer, 0)),
    greatest(0, coalesce(((coalesce(hs.base_attrs, t.attrs))->>'spirit')::integer, 0) + coalesce((t.attr_points->>'spirit')::integer, 0) + coalesce((t.bonuses->>'spirit')::integer, 0) + coalesce((t.skills->>'Clash')::integer, 0) + coalesce((t.bonuses->>'clash')::integer, 0)),
    greatest(0, coalesce(((coalesce(hs.base_attrs, t.attrs))->>'dexterity')::integer, 0) + coalesce((t.attr_points->>'dexterity')::integer, 0) + coalesce((t.bonuses->>'dexterity')::integer, 0) + coalesce((t.skills->>'Evasion')::integer, 0) + coalesce((t.bonuses->>'evasion')::integer, 0))
  from public.tokens tok
  join public.digirole_tamers t on t.id = tok.character_id and t.game_id = tok.game_id
  left join public.digirole_species hs
    on hs.id = case when coalesce(t.hybrid_state->>'speciesId', '') ~* '^[0-9a-f-]{36}$'
      then (t.hybrid_state->>'speciesId')::uuid else null end
  where tok.game_id = p_game_id and tok.page_id = p_page_id
    and coalesce(tok.layer, 'tokens') = 'tokens'
    and public.is_game_member(p_game_id, auth.uid());
$$;
revoke all on function public.get_digirole_target_info(uuid, uuid) from public;
grant execute on function public.get_digirole_target_info(uuid, uuid) to authenticated;
