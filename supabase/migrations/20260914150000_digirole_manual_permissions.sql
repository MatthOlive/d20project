-- DigiRole sheets are private by default and can be shared explicitly by the narrator.
drop policy if exists "owners and narrators view digirole tamers" on public.digirole_tamers;
drop policy if exists "owners and narrators update digirole tamers" on public.digirole_tamers;
drop policy if exists "owners and narrators delete digirole tamers" on public.digirole_tamers;
create policy "owners and narrators view digirole tamers" on public.digirole_tamers
for select to authenticated using (
  public.is_game_member(game_id, auth.uid()) and (
    owner_id = auth.uid()
    or public.is_game_narrator(game_id, auth.uid())
    or auth.uid() = any(coalesce(allowed_viewers, array[]::uuid[]))
    or auth.uid() = any(coalesce(allowed_editors, array[]::uuid[]))
  )
);
create policy "owners and narrators update digirole tamers" on public.digirole_tamers
for update to authenticated using (
  owner_id = auth.uid()
  or public.is_game_narrator(game_id, auth.uid())
  or auth.uid() = any(coalesce(allowed_editors, array[]::uuid[]))
) with check (
  owner_id = auth.uid()
  or public.is_game_narrator(game_id, auth.uid())
  or auth.uid() = any(coalesce(allowed_editors, array[]::uuid[]))
);
create policy "owners and narrators delete digirole tamers" on public.digirole_tamers
for delete to authenticated using (
  owner_id = auth.uid()
  or public.is_game_narrator(game_id, auth.uid())
  or auth.uid() = any(coalesce(allowed_editors, array[]::uuid[]))
);

drop policy if exists "owners and narrators view digirole digimons" on public.digirole_digimons;
drop policy if exists "owners and narrators update digirole digimons" on public.digirole_digimons;
drop policy if exists "owners and narrators delete digirole digimons" on public.digirole_digimons;
create policy "owners and narrators view digirole digimons" on public.digirole_digimons
for select to authenticated using (
  public.is_game_member(game_id, auth.uid()) and (
    owner_id = auth.uid()
    or public.is_game_narrator(game_id, auth.uid())
    or auth.uid() = any(coalesce(allowed_viewers, array[]::uuid[]))
    or auth.uid() = any(coalesce(allowed_editors, array[]::uuid[]))
  )
);
create policy "owners and narrators update digirole digimons" on public.digirole_digimons
for update to authenticated using (
  owner_id = auth.uid()
  or public.is_game_narrator(game_id, auth.uid())
  or auth.uid() = any(coalesce(allowed_editors, array[]::uuid[]))
) with check (
  owner_id = auth.uid()
  or public.is_game_narrator(game_id, auth.uid())
  or auth.uid() = any(coalesce(allowed_editors, array[]::uuid[]))
);
create policy "owners and narrators delete digirole digimons" on public.digirole_digimons
for delete to authenticated using (
  owner_id = auth.uid()
  or public.is_game_narrator(game_id, auth.uid())
  or auth.uid() = any(coalesce(allowed_editors, array[]::uuid[]))
);

drop policy if exists "owners and narrators view digirole learned techniques"
  on public.digirole_digimon_techniques;
drop policy if exists "owners and narrators manage digirole learned techniques"
  on public.digirole_digimon_techniques;
create policy "owners and narrators view digirole learned techniques"
on public.digirole_digimon_techniques for select to authenticated using (exists (
  select 1 from public.digirole_digimons digimon
  where digimon.id = digimon_id and (
    digimon.owner_id = auth.uid()
    or public.is_game_narrator(digimon.game_id, auth.uid())
    or auth.uid() = any(coalesce(digimon.allowed_viewers, array[]::uuid[]))
    or auth.uid() = any(coalesce(digimon.allowed_editors, array[]::uuid[]))
  )
));
create policy "owners and narrators manage digirole learned techniques"
on public.digirole_digimon_techniques for all to authenticated using (exists (
  select 1 from public.digirole_digimons digimon
  where digimon.id = digimon_id and (
    digimon.owner_id = auth.uid()
    or public.is_game_narrator(digimon.game_id, auth.uid())
    or auth.uid() = any(coalesce(digimon.allowed_editors, array[]::uuid[]))
  )
)) with check (exists (
  select 1 from public.digirole_digimons digimon
  where digimon.id = digimon_id and (
    digimon.owner_id = auth.uid()
    or public.is_game_narrator(digimon.game_id, auth.uid())
    or auth.uid() = any(coalesce(digimon.allowed_editors, array[]::uuid[]))
  )
));

drop policy if exists "owners and narrators view digirole forms" on public.digirole_forms;
drop policy if exists "owners and narrators manage digirole forms" on public.digirole_forms;
create policy "owners and narrators view digirole forms" on public.digirole_forms
for select to authenticated using (exists (
  select 1 from public.digirole_digimons digimon
  where digimon.id = digimon_id and (
    digimon.owner_id = auth.uid()
    or public.is_game_narrator(digimon.game_id, auth.uid())
    or auth.uid() = any(coalesce(digimon.allowed_viewers, array[]::uuid[]))
    or auth.uid() = any(coalesce(digimon.allowed_editors, array[]::uuid[]))
  )
));
create policy "owners and narrators manage digirole forms" on public.digirole_forms
for all to authenticated using (exists (
  select 1 from public.digirole_digimons digimon
  where digimon.id = digimon_id and (
    digimon.owner_id = auth.uid()
    or public.is_game_narrator(digimon.game_id, auth.uid())
    or auth.uid() = any(coalesce(digimon.allowed_editors, array[]::uuid[]))
  )
)) with check (exists (
  select 1 from public.digirole_digimons digimon
  where digimon.id = digimon_id and (
    digimon.owner_id = auth.uid()
    or public.is_game_narrator(digimon.game_id, auth.uid())
    or auth.uid() = any(coalesce(digimon.allowed_editors, array[]::uuid[]))
  )
));

drop policy if exists "owners and narrators view digirole scans" on public.digirole_scan_data;
drop policy if exists "owners and narrators manage digirole scans" on public.digirole_scan_data;
create policy "owners and narrators view digirole scans" on public.digirole_scan_data
for select to authenticated using (exists (
  select 1 from public.digirole_tamers tamer
  where tamer.id = tamer_id and (
    tamer.owner_id = auth.uid()
    or public.is_game_narrator(tamer.game_id, auth.uid())
    or auth.uid() = any(coalesce(tamer.allowed_viewers, array[]::uuid[]))
    or auth.uid() = any(coalesce(tamer.allowed_editors, array[]::uuid[]))
  )
));
create policy "owners and narrators manage digirole scans" on public.digirole_scan_data
for all to authenticated using (exists (
  select 1 from public.digirole_tamers tamer
  where tamer.id = tamer_id and (
    tamer.owner_id = auth.uid()
    or public.is_game_narrator(tamer.game_id, auth.uid())
    or auth.uid() = any(coalesce(tamer.allowed_editors, array[]::uuid[]))
  )
)) with check (exists (
  select 1 from public.digirole_tamers tamer
  where tamer.id = tamer_id and (
    tamer.owner_id = auth.uid()
    or public.is_game_narrator(tamer.game_id, auth.uid())
    or auth.uid() = any(coalesce(tamer.allowed_editors, array[]::uuid[]))
  )
));

create or replace function public.can_control_digirole_character(
  p_game_id uuid,
  p_character_id uuid,
  p_user_id uuid
)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_game_narrator(p_game_id, p_user_id)
    or exists(
      select 1 from public.digirole_tamers
      where id = p_character_id and game_id = p_game_id
        and (owner_id = p_user_id or p_user_id = any(coalesce(allowed_editors, array[]::uuid[])))
    )
    or exists(
      select 1 from public.digirole_digimons
      where id = p_character_id and game_id = p_game_id
        and (owner_id = p_user_id or p_user_id = any(coalesce(allowed_editors, array[]::uuid[])))
    );
$$;

create or replace function public.can_view_character(_game uuid, _kind text, _character uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when _kind = 'pokemon' then exists (
      select 1 from public.pokemon p left join public.trainers t on t.id = p.owner_trainer_id
      where p.id = _character and p.game_id = _game and public.is_game_member(p.game_id, auth.uid()) and (
        coalesce(cardinality(p.allowed_viewers), 0) = 0 or p.owner_id = auth.uid()
        or public.is_game_narrator(p.game_id, auth.uid())
        or auth.uid() = any(coalesce(p.allowed_viewers, array[]::uuid[]))
        or auth.uid() = any(coalesce(p.allowed_editors, array[]::uuid[]))
        or (t.id is not null and (t.owner_id = auth.uid()
          or auth.uid() = any(coalesce(t.allowed_viewers, array[]::uuid[]))
          or auth.uid() = any(coalesce(t.allowed_editors, array[]::uuid[]))))
      )
    )
    when _kind = 'trainer' then exists (
      select 1 from public.trainers t where t.id = _character and t.game_id = _game
      and (public.is_game_member(t.game_id, auth.uid()) or public.is_game_narrator(t.game_id, auth.uid())) and (
        coalesce(cardinality(t.allowed_viewers), 0) = 0 or t.owner_id = auth.uid()
        or public.is_game_narrator(t.game_id, auth.uid())
        or auth.uid() = any(coalesce(t.allowed_viewers, array[]::uuid[]))
        or auth.uid() = any(coalesce(t.allowed_editors, array[]::uuid[]))
      )
    )
    when _kind = 't20' then exists (
      select 1 from public.t20_characters c where c.id = _character and c.game_id = _game
      and public.is_game_member(c.game_id, auth.uid()) and (
        coalesce(cardinality(c.allowed_viewers), 0) = 0 or c.owner_id = auth.uid()
        or public.is_game_narrator(c.game_id, auth.uid())
        or auth.uid() = any(coalesce(c.allowed_viewers, array[]::uuid[]))
        or auth.uid() = any(coalesce(c.allowed_editors, array[]::uuid[]))
      )
    )
    when _kind = 'digirole_tamer' then exists (
      select 1 from public.digirole_tamers c where c.id = _character and c.game_id = _game
      and public.is_game_member(c.game_id, auth.uid()) and (
        c.owner_id = auth.uid() or public.is_game_narrator(c.game_id, auth.uid())
        or auth.uid() = any(coalesce(c.allowed_viewers, array[]::uuid[]))
        or auth.uid() = any(coalesce(c.allowed_editors, array[]::uuid[]))
      )
    )
    when _kind = 'digirole_digimon' then exists (
      select 1 from public.digirole_digimons c where c.id = _character and c.game_id = _game
      and public.is_game_member(c.game_id, auth.uid()) and (
        c.owner_id = auth.uid() or public.is_game_narrator(c.game_id, auth.uid())
        or auth.uid() = any(coalesce(c.allowed_viewers, array[]::uuid[]))
        or auth.uid() = any(coalesce(c.allowed_editors, array[]::uuid[]))
      )
    )
    else false
  end;
$$;
