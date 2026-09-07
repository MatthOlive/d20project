  -- Rich sheets and an atomic four-slot roster for DigiRole.
  alter table public.digirole_tamers
    add column if not exists bonuses jsonb not null default '{}'::jsonb,
    add column if not exists equipment jsonb not null default '{}'::jsonb,
    add column if not exists pe integer not null default 0,
    add column if not exists battles integer not null default 0,
    add column if not exists victories integer not null default 0,
    add column if not exists bits bigint not null default 0,
    add column if not exists hybrid_state jsonb not null default '{}'::jsonb;

  alter table public.digirole_digimons
    add column if not exists bonuses jsonb not null default '{}'::jsonb,
    add column if not exists equipment jsonb not null default '{}'::jsonb,
    add column if not exists team_slot smallint,
    add column if not exists image_hidden boolean not null default false,
    add column if not exists notoriety jsonb not null default '{"Connections":0,"Fame":0,"Sponsors":0,"Supporters":0}'::jsonb;

  alter table public.digirole_digimons drop constraint if exists digirole_digimons_team_slot_check;
  alter table public.digirole_digimons add constraint digirole_digimons_team_slot_check
    check (team_slot is null or team_slot between 1 and 4);
  create unique index if not exists digirole_digimons_tamer_team_slot_unique
    on public.digirole_digimons(tamer_id, team_slot) where tamer_id is not null and team_slot is not null;

  alter table public.digirole_species drop constraint if exists digirole_species_stage_check;
  alter table public.digirole_species add constraint digirole_species_stage_check check (
    stage in ('In-Training I','In-Training II','Rookie','Champion','Ultimate','Mega','Mega+','Armor','Hybrid','Jogress')
  );

  create table if not exists public.digirole_items (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    item_type text not null default 'Geral',
    description text not null default '',
    price integer not null default 0 check (price >= 0),
    hybrid_species text[] not null default '{}',
    created_at timestamptz not null default now()
  );
  alter table public.digirole_items enable row level security;
  drop policy if exists "members view digirole items" on public.digirole_items;
  create policy "members view digirole items" on public.digirole_items for select to authenticated using (true);

  create table if not exists public.digirole_routes (
    id uuid primary key default gen_random_uuid(),
    game_id uuid not null references public.games(id) on delete cascade,
    owner_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    species_ids uuid[] not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(game_id, name)
  );
  alter table public.digirole_routes enable row level security;
  drop policy if exists "members view digirole routes" on public.digirole_routes;
  create policy "members view digirole routes" on public.digirole_routes for select to authenticated
    using (public.is_game_member(game_id, auth.uid()));
  drop policy if exists "narrators manage digirole routes" on public.digirole_routes;
  create policy "narrators manage digirole routes" on public.digirole_routes for all to authenticated
    using (public.is_game_narrator(game_id, auth.uid()))
    with check (public.is_game_narrator(game_id, auth.uid()));

  create or replace function public.assign_digimon_to_tamer(
    p_digimon_id uuid,
    p_tamer_id uuid,
    p_team_slot integer default 0
  ) returns integer
  language plpgsql security definer set search_path = public set row_security = off as $$
  declare
    v_digimon public.digirole_digimons%rowtype;
    v_tamer public.digirole_tamers%rowtype;
    v_slot integer;
  begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    select * into v_digimon from public.digirole_digimons where id = p_digimon_id for update;
    select * into v_tamer from public.digirole_tamers where id = p_tamer_id for update;
    if v_digimon.id is null or v_tamer.id is null or v_digimon.game_id <> v_tamer.game_id then
      raise exception 'Digimon and Tamer must belong to the same game';
    end if;
    if not (public.can_edit_character(v_tamer.game_id, v_tamer.owner_id) or auth.uid() = any(v_tamer.allowed_editors)) then
      raise exception 'You cannot organize this Tamer roster';
    end if;
    if not public.can_view_character(v_digimon.game_id, 'digirole_digimon', v_digimon.id) then
      raise exception 'You cannot use this Digimon';
    end if;

    if p_team_slot is null then
      v_slot := null;
    elsif p_team_slot between 1 and 4 then
      v_slot := p_team_slot;
    else
      select slot into v_slot from generate_series(1, 4) slot
        where not exists (
          select 1 from public.digirole_digimons d
          where d.tamer_id = p_tamer_id and d.team_slot = slot and d.id <> p_digimon_id
        ) order by slot limit 1;
    end if;

    if v_slot is not null then
      update public.digirole_digimons set team_slot = null
        where tamer_id = p_tamer_id and team_slot = v_slot and id <> p_digimon_id;
    end if;
    update public.digirole_digimons
      set tamer_id = p_tamer_id, team_slot = v_slot,
          owner_id = v_tamer.owner_id,
          allowed_viewers = v_tamer.allowed_viewers,
          allowed_editors = v_tamer.allowed_editors
      where id = p_digimon_id;
    return v_slot;
  end;
  $$;
  revoke all on function public.assign_digimon_to_tamer(uuid, uuid, integer) from public;
  grant execute on function public.assign_digimon_to_tamer(uuid, uuid, integer) to authenticated;

  insert into public.digirole_items(name,item_type,description,price) values
    ('HP Capsule I','Recuperação','Recupera 2 HP.',100),
    ('HP Capsule II','Recuperação','Recupera 4 HP.',250),
    ('HP Capsule III','Recuperação','Recupera 6 HP.',0),
    ('HP Spray I','Recuperação','Recupera 1 HP de todos os aliados materializados.',300),
    ('HP Spray II','Recuperação','Recupera 3 HP de todos os aliados materializados.',0),
    ('HP Spray III','Recuperação','Recupera 5 HP de todos os aliados materializados.',0),
    ('Medical Spray','Recuperação','Recupera 5 HP e remove Injury.',0),
    ('Medical Spray DX','Recuperação','Restaura todo o HP e remove Injury.',0),
    ('DS Capsule I','Recuperação','Recupera 2 DS.',120),
    ('DS Capsule II','Recuperação','Recupera 4 DS.',280),
    ('DS Capsule III','Recuperação','Recupera 6 DS.',0),
    ('DS Spray I','Recuperação','Recupera 1 DS de todos os aliados materializados.',350),
    ('DS Spray II','Recuperação','Recupera 3 DS de todos os aliados materializados.',0),
    ('DS Spray III','Recuperação','Recupera 5 DS de todos os aliados materializados.',0),
    ('Poison Recovery','Condições','Remove Poison ou Deadly Poison.',180),
    ('Panic Recovery','Condições','Remove Confused ou Chaos.',180),
    ('Paralysis Recovery','Condições','Remove Paralysis ou Immobilization.',180),
    ('Sleep Recovery','Condições','Remove Sleep ou Deep Slumber.',180),
    ('Wake-Up','Condições','Remove Flinched.',120),
    ('Sprite Recovery','Condições','Remove Disabled.',200),
    ('Bug Recovery','Condições','Remove Reverse.',200),
    ('Pain Recovery','Condições','Remove Injury.',250),
    ('Sickness Recovery','Condições','Remove Disease.',250),
    ('Stat Recovery','Condições','Remove uma redução de Atributo.',220),
    ('Multi Recovery','Condições','Remove uma condição básica à escolha.',400),
    ('ATK Boost','Boosts','STR +1 por 3 rodadas.',200),
    ('DEF Boost','Boosts','VIT +1 por 3 rodadas.',200),
    ('INT Boost','Boosts','WIS +1 por 3 rodadas.',200),
    ('SPI Boost','Boosts','SPR +1 por 3 rodadas.',200),
    ('SPD Boost','Boosts','DEX +1 por 3 rodadas.',200),
    ('ACU Boost','Boosts','Accuracy +1 dado por 3 rodadas.',250),
    ('EVA Boost','Boosts','Evasion +1 dado por 3 rodadas.',250),
    ('Friendship S','Amizade','Pequeno progresso narrativo de Vínculo.',250),
    ('Friendship','Amizade','Progresso narrativo significativo de Vínculo.',0),
    ('Friendship DX','Amizade','Progresso narrativo excepcional de Vínculo.',0),
    ('Courage Point I','Treinamento','Concede +1 sucesso automático de Training.',300),
    ('Courage Point II','Treinamento','Concede +2 sucessos automáticos de Training.',0),
    ('Courage Point III','Treinamento','Concede +3 sucessos automáticos de Training.',0),
    ('Courage Point IV','Treinamento','Concede +5 sucessos automáticos de Training.',0),
    ('Digiclon D','Treinamento','Concede +1 dado na Training Roll.',300),
    ('Digiclon C','Treinamento','Concede +2 dados na Training Roll.',600),
    ('Digiclon B','Treinamento','Concede +3 dados na Training Roll.',0),
    ('Digiclon A','Treinamento','Concede +4 dados na Training Roll.',0),
    ('Digiclon S','Treinamento','Concede +5 dados na Training Roll.',0),
    ('Backup Disk','Treinamento','Rerrola toda a Training Roll; o segundo resultado prevalece.',500),
    ('HP Attachment I','Attachments','Concede +1 HP máximo.',800),
    ('SP Attachment I','Attachments','Concede +1 DS máximo.',800),
    ('ATK Attachment I','Attachments','Concede STR +1.',800),
    ('DEF Attachment I','Attachments','Concede VIT +1.',800),
    ('INT Attachment I','Attachments','Concede WIS +1.',800),
    ('SPI Attachment I','Attachments','Concede SPR +1.',800),
    ('SPD Attachment I','Attachments','Concede DEX +1.',800),
    ('Mode Selector','Evolução','Troca para outra forma já desbloqueada do mesmo estágio; consumível.',0),
    ('Accelerator','Evolução','Substitui até 10 pagamentos de manutenção de uma forma Mega+.',0),
    ('Omni Blade','Evolução','Item único exigido por Imperialdramon Paladin Mode.',0),
    ('Digi-Egg','Evolução','Catalisador específico de formas Armor.',0),
    ('Digimental da Coragem','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Coragem.',0),
    ('Digimental da Amizade','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Amizade.',0),
    ('Digimental do Amor','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas ao Amor.',0),
    ('Digimental da Pureza','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Pureza.',0),
    ('Digimental do Conhecimento','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas ao Conhecimento.',0),
    ('Digimental da Sinceridade','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Sinceridade.',0),
    ('Digimental da Esperança','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Esperança.',0),
    ('Digimental da Luz','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Luz.',0),
    ('Digimental da Bondade','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas à Bondade.',0),
    ('Digimental dos Milagres','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas aos Milagres.',0),
    ('Digimental do Destino','Digimentals','Catalisador narrativo para Digievoluções Armor ligadas ao Destino.',0),
    ('DigiSpirit','Evolução','Catalisador específico de formas Hybrid.',0),
    ('Chipset I · DR','Chipsets','+1 dado de Training para Digimon do Field DR.',1200),
    ('Chipset I · NSp','Chipsets','+1 dado de Training para Digimon do Field NSp.',1200),
    ('Chipset I · DS','Chipsets','+1 dado de Training para Digimon do Field DS.',1200),
    ('Chipset I · WG','Chipsets','+1 dado de Training para Digimon do Field WG.',1200),
    ('Chipset I · ME','Chipsets','+1 dado de Training para Digimon do Field ME.',1200),
    ('Chipset I · JT','Chipsets','+1 dado de Training para Digimon do Field JT.',1200),
    ('Chipset I · VB','Chipsets','+1 dado de Training para Digimon do Field VB.',1200),
    ('Chipset I · NSo','Chipsets','+1 dado de Training para Digimon do Field NSo.',1200),
    ('Alpha Weapon','Armas','Poder 1; requer Atributo 2 e Perícia 1.',1000),
    ('Beta Weapon','Armas','Poder 2; requer Atributo 3 e Perícia 2.',0),
    ('Gamma Weapon','Armas','Poder 3; requer Atributo 3 e Perícia 3.',0),
    ('Delta Weapon','Armas','Poder 4; requer Atributo 4 e Perícia 4.',0),
    ('Epsilon Weapon','Armas','Poder 5; requer Atributo 5 e Perícia 5.',0),
    ('Guard Core','Armor Cores','Concede +1 HP máximo.',1000),
    ('Physical Core','Armor Cores','+1 dado de proteção contra ataques físicos.',1000),
    ('Energy Core','Armor Cores','+1 dado de proteção contra ataques de energia.',1000),
    ('Vital Core','Armor Cores','Concede VIT +1.',1000),
    ('Resonance Core','Armor Cores','Concede WIS +1.',1000),
    ('Speed Board','Armor Boards','Concede +1 dado na Pool de iniciativa.',900),
    ('Evasion Board','Armor Boards','Concede +1 dado em Evasion.',900),
    ('Clash Board','Armor Boards','Concede +1 dado em Clash.',900),
    ('Field Board','Armor Boards','Concede +1 dado em exploração ligada ao Field escolhido.',900),
    ('Utility Board','Armor Boards','Concede +1 dado em uma Perícia escolhida.',900)
  on conflict (name) do update set item_type=excluded.item_type,description=excluded.description,price=excluded.price;

  insert into public.digirole_species(name,stage,digi_attribute,species_type,fields,available_fields,hp_base,base_attrs,stabilization_text,stabilization_victories)
  select name,'Hybrid',attribute,'Hybrid',fields,fields||array['Neutra'],hp,'{"strength":3,"dexterity":3,"vitality":3,"wisdom":2,"spirit":3,"charisma":2}'::jsonb,'Requer o DigiSpirit específico.',30
  from (values
    ('Agunimon','Vaccine',array['DR'],5),('BurningGreymon','Vaccine',array['DR'],6),
    ('Lobomon','Vaccine',array['NSp'],5),('KendoGarurumon','Vaccine',array['NSp'],6),
    ('Kazemon','Data',array['WG'],5),('Zephyrmon','Data',array['WG'],6),
    ('Beetlemon','Data',array['JT'],5),('MetalKabuterimon','Data',array['JT'],6),
    ('Kumamon','Vaccine',array['DS'],5),('Korikakumon','Vaccine',array['DS'],6),
    ('Lowemon','Virus',array['NSo'],5),('KaiserLeomon','Virus',array['NSo'],6),
    ('Mercurymon','Virus',array['ME'],5),('Sakkakumon','Virus',array['ME'],6),
    ('Arbormon','Virus',array['JT'],5),('Petaldramon','Virus',array['JT'],6),
    ('Grumblemon','Virus',array['NSp'],5),('Gigasmon','Virus',array['NSp'],6),
    ('Ranamon','Data',array['DS'],5),('Calmaramon','Data',array['DS'],6),
    ('Duskmon','Virus',array['NSo'],5),('Velgemon','Virus',array['NSo'],6)
  ) as forms(name,attribute,fields,hp)
  on conflict (name) do update set stage=excluded.stage, stabilization_text=excluded.stabilization_text;

  insert into public.digirole_items(name,item_type,description,price,hybrid_species)
  select 'DigiSpirit de '||name,'Evolução','Libera a Digievolução Hybrid para '||name||'.',0,array[name]
  from (values ('Agunimon'),('BurningGreymon'),('Lobomon'),('KendoGarurumon'),('Kazemon'),('Zephyrmon'),('Beetlemon'),('MetalKabuterimon'),('Kumamon'),('Korikakumon'),('Lowemon'),('KaiserLeomon'),('Mercurymon'),('Sakkakumon'),('Arbormon'),('Petaldramon'),('Grumblemon'),('Gigasmon'),('Ranamon'),('Calmaramon'),('Duskmon'),('Velgemon')) forms(name)
  on conflict (name) do update set hybrid_species=excluded.hybrid_species,description=excluded.description;

  -- Evolution routes are unlocked from the active species route text. The target may
  -- be the next stage even before the sheet rank is manually changed.
  create or replace function public.unlock_digirole_form(
    p_digimon_id uuid,
    p_species_id uuid,
    p_requirements_confirmed boolean,
    p_force boolean default false
  ) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
  declare
    v_digimon public.digirole_digimons%rowtype;
    v_current public.digirole_species%rowtype;
    v_target public.digirole_species%rowtype;
    v_cost integer;
  begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    select * into v_digimon from public.digirole_digimons where id = p_digimon_id for update;
    if v_digimon.id is null then raise exception 'Digimon not found'; end if;
    if not (public.can_edit_character(v_digimon.game_id, v_digimon.owner_id) or auth.uid() = any(v_digimon.allowed_editors)) then
      raise exception 'You cannot update this Digimon';
    end if;
    if p_force and not public.is_game_narrator(v_digimon.game_id, auth.uid()) then
      raise exception 'Only the narrator can force an evolution route';
    end if;
    if exists (select 1 from public.digirole_forms where digimon_id = p_digimon_id and species_id = p_species_id) then
      return jsonb_build_object('alreadyUnlocked', true, 'speciesId', p_species_id, 'cost', 0);
    end if;
    select * into v_current from public.digirole_species where id = v_digimon.species_id;
    select * into v_target from public.digirole_species where id = p_species_id;
    if v_target.id is null then raise exception 'Target form not found'; end if;
    if not p_force and not p_requirements_confirmed then raise exception 'Confirm the form requirements before unlocking it'; end if;
    if not p_force and (v_current.evolution_text is null or position(upper(v_target.name) in upper(v_current.evolution_text)) = 0) then
      raise exception 'This form is not listed in the current evolution routes';
    end if;
    v_cost := case v_target.stage
      when 'In-Training II' then 2 when 'Rookie' then 5 when 'Champion' then 15
      when 'Ultimate' then 25 when 'Mega' then 40 when 'Mega+' then 40
      when 'Armor' then 15 when 'Hybrid' then 15 when 'Jogress' then 25 else 0 end;
    if not p_force and v_digimon.pe < v_cost then raise exception 'Not enough Evolution Points'; end if;
    insert into public.digirole_forms(digimon_id,species_id,stabilized,victories,requirements_confirmed)
      values (p_digimon_id,p_species_id,false,0,p_requirements_confirmed or p_force);
    if not p_force then update public.digirole_digimons set pe = pe - v_cost where id = p_digimon_id; end if;
    return jsonb_build_object('speciesId',p_species_id,'cost',case when p_force then 0 else v_cost end,'forced',p_force);
  end;
  $$;
  revoke all on function public.unlock_digirole_form(uuid, uuid, boolean, boolean) from public;
  grant execute on function public.unlock_digirole_form(uuid, uuid, boolean, boolean) to authenticated;

  -- Older standalone Digimon may not have a Tamer yet. Their first evolution can
  -- still proceed by paying the normally Tamer-paid DS from the Digimon itself.
  create or replace function public.transform_digirole_form(
    p_digimon_id uuid,
    p_species_id uuid
  ) returns jsonb language plpgsql security definer set search_path = public set row_security = off as $$
  declare
    v_digimon public.digirole_digimons%rowtype;
    v_current public.digirole_species%rowtype;
    v_target public.digirole_species%rowtype;
    v_form public.digirole_forms%rowtype;
    v_rank_order text[] := array['In-Training I','In-Training II','Rookie','Champion','Ultimate','Mega','Mega+'];
    v_current_index integer;
    v_target_index integer;
    v_step integer;
    v_tamer_cost integer := 0;
    v_digimon_cost integer := 0;
    v_old_max integer;
    v_new_max integer;
    v_vitality integer;
    v_technique_id uuid;
    v_maintenance integer := 0;
  begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    select * into v_digimon from public.digirole_digimons where id = p_digimon_id for update;
    if v_digimon.id is null then raise exception 'Digimon not found'; end if;
    if not (public.can_edit_character(v_digimon.game_id, v_digimon.owner_id) or auth.uid() = any(v_digimon.allowed_editors)) then raise exception 'You cannot update this Digimon'; end if;
    select * into v_form from public.digirole_forms where digimon_id = p_digimon_id and species_id = p_species_id;
    if v_form.digimon_id is null then raise exception 'This form has not been unlocked'; end if;
    if v_digimon.species_id = p_species_id then return jsonb_build_object('speciesId',p_species_id,'alreadyActive',true,'cost',0); end if;
    select * into v_current from public.digirole_species where id = v_digimon.species_id;
    select * into v_target from public.digirole_species where id = p_species_id;
    v_current_index := array_position(v_rank_order,v_current.stage);
    v_target_index := array_position(v_rank_order,v_target.stage);
    if v_current_index is null or v_target_index is null then raise exception 'Use the special evolution control for this form'; end if;
    if v_target_index > v_current_index then
      for v_step in (v_current_index + 1)..v_target_index loop
        if v_step = 2 and v_current_index = 1 then v_tamer_cost := v_tamer_cost + 1;
        else v_digimon_cost := v_digimon_cost + case v_step when 2 then 1 when 3 then 1 when 4 then 2 when 5 then 4 when 6 then 6 else 0 end;
        end if;
      end loop;
      v_digimon_cost := v_digimon_cost + greatest(0,v_target_index-v_current_index-1);
    end if;
    if v_tamer_cost > 0 and v_digimon.tamer_id is not null then
      if not exists(select 1 from public.digirole_tamers where id=v_digimon.tamer_id and ds_current>=v_tamer_cost) then raise exception 'The Tamer does not have enough DigiSoul'; end if;
      update public.digirole_tamers set ds_current=ds_current-v_tamer_cost where id=v_digimon.tamer_id;
    elsif v_tamer_cost > 0 then
      v_digimon_cost := v_digimon_cost + v_tamer_cost;
      v_tamer_cost := 0;
    end if;
    if v_digimon.ds_current < v_digimon_cost then raise exception 'The Digimon does not have enough DigiSoul'; end if;
    v_vitality := coalesce((v_digimon.attrs->>'vitality')::integer,1);
    v_old_max := coalesce(v_current.hp_base,3)+v_vitality;
    v_new_max := v_target.hp_base+v_vitality;
    if not v_form.stabilized then v_maintenance := case v_target.stage when 'In-Training II' then 1 when 'Rookie' then 1 when 'Champion' then 1 when 'Ultimate' then 2 when 'Mega' then 3 else 0 end; end if;
    update public.digirole_digimons set species_id=p_species_id, ds_current=ds_current-v_digimon_cost,
      hp_current=greatest(0,least(v_new_max,hp_current+(v_new_max-v_old_max))),
      evolution_state=evolution_state||jsonb_build_object('activeSpeciesId',p_species_id,'activeSpeciesName',v_target.name,'maintenanceDs',v_maintenance,'transformedAt',now()) where id=p_digimon_id;
    if v_target.signature_technique is not null then
      select id into v_technique_id from public.digirole_techniques where lower(name)=lower(v_target.signature_technique)
        order by case when lower(origin)=lower(v_target.name) then 0 else 1 end, source_page nulls last limit 1;
      if v_technique_id is not null then insert into public.digirole_digimon_techniques(digimon_id,technique_id,source) values(p_digimon_id,v_technique_id,'signature') on conflict do nothing; end if;
    end if;
    return jsonb_build_object('speciesId',p_species_id,'speciesName',v_target.name,'tamerDsCost',v_tamer_cost,'digimonDsCost',v_digimon_cost,'maintenanceDs',v_maintenance,'stabilized',v_form.stabilized);
  end;
  $$;
  revoke all on function public.transform_digirole_form(uuid, uuid) from public;
  grant execute on function public.transform_digirole_form(uuid, uuid) to authenticated;
