-- LANCER phases 2-3: campaign content packs, compendium and atomic build commits.

create table if not exists public.lancer_content_packs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  package_key text not null,
  name text not null,
  author text,
  version text not null,
  description text,
  manifest jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  imported_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lancer_content_pack_manifest_object check (jsonb_typeof(manifest) = 'object'),
  constraint lancer_content_pack_key_length check (char_length(package_key) between 1 and 200),
  unique (game_id, package_key)
);

create table if not exists public.lancer_compendium_items (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete cascade,
  pack_id uuid references public.lancer_content_packs(id) on delete cascade,
  item_type text not null check (item_type in (
    'frame', 'weapon', 'system', 'pilot_gear', 'pilot_armor', 'talent', 'license',
    'core_bonus', 'manufacturer', 'npc_class', 'npc_template', 'npc_feature',
    'status', 'condition', 'tag', 'action', 'reserve', 'sitreps', 'other'
  )),
  external_id text not null,
  name text not null,
  description text,
  source_type text not null default 'lcp' check (source_type in ('core', 'lcp', 'homebrew', 'campaign')),
  source_name text,
  data jsonb not null default '{}'::jsonb,
  action_definitions jsonb not null default '[]'::jsonb,
  effect_definitions jsonb not null default '[]'::jsonb,
  trigger_definitions jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lancer_compendium_data_object check (jsonb_typeof(data) = 'object'),
  constraint lancer_compendium_actions_array check (jsonb_typeof(action_definitions) = 'array'),
  constraint lancer_compendium_effects_array check (jsonb_typeof(effect_definitions) = 'array'),
  constraint lancer_compendium_triggers_array check (jsonb_typeof(trigger_definitions) = 'array'),
  constraint lancer_compendium_scope check (
    (source_type = 'core' and game_id is null and pack_id is null)
    or (game_id is not null)
  ),
  unique nulls not distinct (pack_id, item_type, external_id)
);

create index if not exists lancer_compendium_game_type_name_idx
  on public.lancer_compendium_items(game_id, item_type, name);
create index if not exists lancer_compendium_pack_idx
  on public.lancer_compendium_items(pack_id);
create index if not exists lancer_compendium_data_gin_idx
  on public.lancer_compendium_items using gin(data);

create table if not exists public.lancer_compendium_favorites (
  item_id uuid not null references public.lancer_compendium_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

alter table public.lancer_content_packs enable row level security;
alter table public.lancer_compendium_items enable row level security;
alter table public.lancer_compendium_favorites enable row level security;

drop policy if exists "members view lancer content packs" on public.lancer_content_packs;
create policy "members view lancer content packs"
  on public.lancer_content_packs for select to authenticated
  using (public.is_game_member(game_id, auth.uid()) or public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "gm manages lancer content packs" on public.lancer_content_packs;
create policy "gm manages lancer content packs"
  on public.lancer_content_packs for all to authenticated
  using (public.is_game_narrator(game_id, auth.uid()))
  with check (public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "members view lancer compendium" on public.lancer_compendium_items;
create policy "members view lancer compendium"
  on public.lancer_compendium_items for select to authenticated
  using (
    (source_type = 'core' and enabled)
    or (game_id is not null and public.is_game_narrator(game_id, auth.uid()))
    or (game_id is not null and enabled and public.is_game_member(game_id, auth.uid()) and (
      pack_id is null or exists (
        select 1 from public.lancer_content_packs pack
        where pack.id = lancer_compendium_items.pack_id and pack.enabled
      )
    ))
  );

drop policy if exists "gm manages lancer compendium" on public.lancer_compendium_items;
create policy "gm manages lancer compendium"
  on public.lancer_compendium_items for all to authenticated
  using (game_id is not null and public.is_game_narrator(game_id, auth.uid()))
  with check (game_id is not null and public.is_game_narrator(game_id, auth.uid()));

drop policy if exists "users manage lancer favorites" on public.lancer_compendium_favorites;
create policy "users manage lancer favorites"
  on public.lancer_compendium_favorites for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.lancer_compendium_items item where item.id = item_id)
  );

create or replace function public.import_lancer_content_pack(
  p_game_id uuid,
  p_manifest jsonb,
  p_items jsonb
)
returns public.lancer_content_packs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pack public.lancer_content_packs;
  v_item jsonb;
  v_name text := btrim(coalesce(p_manifest ->> 'name', ''));
  v_version text := btrim(coalesce(p_manifest ->> 'version', ''));
  v_key text := btrim(coalesce(p_manifest ->> 'id', p_manifest ->> 'package_id', v_name));
  v_type text;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.is_game_narrator(p_game_id, v_user) then
    raise exception 'Only the GM can import content packs' using errcode = '42501';
  end if;
  if not exists (select 1 from public.games where id = p_game_id and system = 'lancer') then
    raise exception 'This campaign does not use LANCER' using errcode = '22023';
  end if;
  if jsonb_typeof(p_manifest) <> 'object' or v_name = '' or v_version = '' or v_key = '' then
    raise exception 'Invalid LCP manifest' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'LCP items must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 10000 then raise exception 'LCP item limit exceeded' using errcode = '22023'; end if;

  insert into public.lancer_content_packs (
    game_id, package_key, name, author, version, description, manifest, enabled, imported_by
  ) values (
    p_game_id, left(v_key, 200), v_name, nullif(p_manifest ->> 'author', ''), v_version,
    nullif(p_manifest ->> 'description', ''), p_manifest, true, v_user
  )
  on conflict (game_id, package_key) do update set
    name = excluded.name,
    author = excluded.author,
    version = excluded.version,
    description = excluded.description,
    manifest = excluded.manifest,
    enabled = true,
    imported_by = excluded.imported_by,
    updated_at = now()
  returning * into v_pack;

  delete from public.lancer_compendium_items where pack_id = v_pack.id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_type := coalesce(v_item ->> 'item_type', 'other');
    if v_type not in (
      'frame', 'weapon', 'system', 'pilot_gear', 'pilot_armor', 'talent', 'license',
      'core_bonus', 'manufacturer', 'npc_class', 'npc_template', 'npc_feature',
      'status', 'condition', 'tag', 'action', 'reserve', 'sitreps', 'other'
    ) then v_type := 'other'; end if;
    if btrim(coalesce(v_item ->> 'external_id', '')) = '' or btrim(coalesce(v_item ->> 'name', '')) = '' then
      raise exception 'LCP item is missing external_id or name' using errcode = '22023';
    end if;
    insert into public.lancer_compendium_items (
      game_id, pack_id, item_type, external_id, name, description, source_type, source_name,
      data, action_definitions, effect_definitions, trigger_definitions, enabled
    ) values (
      p_game_id, v_pack.id, v_type, v_item ->> 'external_id', v_item ->> 'name',
      nullif(v_item ->> 'description', ''), 'lcp', v_pack.name,
      coalesce(v_item -> 'data', '{}'::jsonb),
      coalesce(v_item -> 'action_definitions', '[]'::jsonb),
      coalesce(v_item -> 'effect_definitions', '[]'::jsonb),
      coalesce(v_item -> 'trigger_definitions', '[]'::jsonb), true
    );
  end loop;

  insert into public.lancer_game_events (game_id, actor_user_id, event_type, payload)
  values (p_game_id, v_user, 'content_pack_imported', jsonb_build_object(
    'packId', v_pack.id, 'name', v_pack.name, 'version', v_pack.version, 'items', jsonb_array_length(p_items)
  ));
  return v_pack;
end;
$$;

create or replace function public.commit_lancer_entity_build(
  p_entity_id uuid,
  p_expected_revision bigint,
  p_next_state jsonb,
  p_next_build jsonb,
  p_action_payload jsonb default '{}'::jsonb,
  p_generated_events jsonb default '[]'::jsonb
)
returns public.lancer_entities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_before public.lancer_entities;
  v_after public.lancer_entities;
  v_transaction_id uuid;
  v_event jsonb;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_before from public.lancer_entities where id = p_entity_id for update;
  if not found then raise exception 'LANCER entity not found' using errcode = 'P0002'; end if;
  if not public.can_control_lancer_entity(p_entity_id, v_user) then
    raise exception 'You do not control this entity' using errcode = '42501';
  end if;
  if v_before.revision <> p_expected_revision then
    raise exception 'Entity changed; reload and try again' using errcode = '40001';
  end if;
  if jsonb_typeof(p_next_state) <> 'object'
     or p_next_state ->> 'kind' <> v_before.entity_type
     or coalesce((p_next_state ->> 'schemaVersion')::integer, 0) <> 1
     or jsonb_typeof(p_next_build) <> 'object'
     or coalesce((p_next_build ->> 'schemaVersion')::integer, 0) <> 1 then
    raise exception 'Invalid canonical state or build' using errcode = '22023';
  end if;

  insert into public.lancer_combat_transactions (
    game_id, actor_user_id, action_type, action_payload, before_state, after_state, generated_events
  ) values (
    v_before.game_id, v_user, 'build_updated', coalesce(p_action_payload, '{}'::jsonb),
    jsonb_build_object('entityId', v_before.id, 'revision', v_before.revision, 'state', v_before.current_state, 'build', v_before.build_state),
    jsonb_build_object('entityId', v_before.id, 'revision', v_before.revision + 1, 'state', p_next_state, 'build', p_next_build),
    coalesce(p_generated_events, '[]'::jsonb)
  ) returning id into v_transaction_id;

  update public.lancer_entities set
    current_state = p_next_state,
    build_state = p_next_build,
    revision = revision + 1,
    updated_at = now()
  where id = p_entity_id returning * into v_after;

  insert into public.lancer_game_events (game_id, entity_id, actor_user_id, transaction_id, event_type, payload)
  values (v_after.game_id, v_after.id, v_user, v_transaction_id, 'build_updated',
    coalesce(p_action_payload, '{}'::jsonb) || jsonb_build_object('revision', v_after.revision, 'valid', p_next_build #>> '{validation,valid}'));

  for v_event in select value from jsonb_array_elements(coalesce(p_generated_events, '[]'::jsonb))
  loop
    insert into public.lancer_game_events (game_id, entity_id, actor_user_id, transaction_id, event_type, payload)
    values (v_after.game_id, v_after.id, v_user, v_transaction_id,
      coalesce(nullif(v_event ->> 'type', ''), 'state_changed'), coalesce(v_event -> 'payload', '{}'::jsonb));
  end loop;
  return v_after;
end;
$$;

create or replace function public.record_lancer_roll(
  p_entity_id uuid,
  p_roll_type text,
  p_payload jsonb
)
returns public.lancer_game_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_entity public.lancer_entities;
  v_event public.lancer_game_events;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_entity from public.lancer_entities where id = p_entity_id;
  if not found then raise exception 'LANCER entity not found' using errcode = 'P0002'; end if;
  if not public.can_control_lancer_entity(p_entity_id, v_user) then
    raise exception 'You do not control this entity' using errcode = '42501';
  end if;
  if btrim(coalesce(p_roll_type, '')) = '' or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid roll payload' using errcode = '22023';
  end if;
  insert into public.lancer_game_events (game_id, entity_id, actor_user_id, event_type, payload)
  values (v_entity.game_id, v_entity.id, v_user, 'dice_roll',
    p_payload || jsonb_build_object('rollType', p_roll_type, 'entityName', coalesce(v_entity.callsign, v_entity.name)))
  returning * into v_event;
  return v_event;
end;
$$;

revoke all on function public.import_lancer_content_pack(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.commit_lancer_entity_build(uuid, bigint, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.record_lancer_roll(uuid, text, jsonb) from public, anon;
grant execute on function public.import_lancer_content_pack(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.commit_lancer_entity_build(uuid, bigint, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.record_lancer_roll(uuid, text, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_content_packs'
  ) then alter publication supabase_realtime add table public.lancer_content_packs; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lancer_compendium_items'
  ) then alter publication supabase_realtime add table public.lancer_compendium_items; end if;
end $$;

alter table public.lancer_content_packs replica identity full;
alter table public.lancer_compendium_items replica identity full;
