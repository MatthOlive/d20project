import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl


if len(sys.argv) != 3:
    raise SystemExit("Usage: build-digirole-xlsx-catalog.py <catalog.xlsx> <migration.sql>")

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)

stage_grade = {
    "In-Training I": "I",
    "In-Training II": "II",
    "Rookie": "III",
    "Champion": "IV",
    "Ultimate": "V",
    "Mega": "VI",
}


def text(value):
    return "" if value is None else str(value).strip()


def key(value):
    return text(value).casefold()


sheet_rows = {
    name: [row for row in workbook[name].iter_rows(min_row=5, values_only=True) if text(row[0])]
    for name in ("Fichas RPG", "Técnicas RPG", "Evoluções RPG")
}

forms = sheet_rows["Fichas RPG"]
name_stages = defaultdict(set)
for row in forms:
    name_stages[key(row[0])].add(text(row[1]))


def canonical_name(name, stage):
    base = text(name)
    if len(name_stages[key(base)]) > 1:
        return f"{base} ({text(stage)})"
    return base


species_by_identity = {}
for row in forms:
    name, stage = text(row[0]), text(row[1])
    identity = (key(name), stage)
    species_by_identity[identity] = {
        "source_name": name,
        "name": canonical_name(name, stage),
        "stage": stage,
        "available_fields": [part.strip() for part in text(row[10]).split(",") if part.strip()],
        "hp_base": int(row[8] or 3),
        "suggested_hp": int(row[9] or 0) or None,
        "stabilization_victories": int(row[13] or 0),
        "base_attrs": {
            "strength": int(row[2] or 1),
            "dexterity": int(row[3] or 1),
            "vitality": int(row[4] or 1),
            "wisdom": int(row[5] or 1),
            "spirit": int(row[6] or 1),
        },
    }


def resolve_species(name, stage):
    stage_name = text(stage)
    direct = species_by_identity.get((key(name), stage_name))
    if direct:
        return direct
    suffix = f" ({stage_name})"
    candidate = text(name)
    if candidate.casefold().endswith(suffix.casefold()):
        return species_by_identity.get((key(candidate[: -len(suffix)]), stage_name))
    return None


routes_by_source = defaultdict(list)
route_count = 0
for row in sheet_rows["Evoluções RPG"]:
    source_species = resolve_species(row[0], row[1])
    target_species = resolve_species(row[2], row[3])
    if not source_species or not target_species:
        continue
    requirements = [text(value) for value in row[6:15] if text(value)]
    fulfillment = text(row[15])
    requirement_text = " | ".join(requirements)
    if fulfillment:
        requirement_text = f"{requirement_text} | {fulfillment}" if requirement_text else fulfillment
    routes_by_source[source_species["name"]].append(
        f'{target_species["name"]}: {requirement_text}'
    )
    route_count += 1


technique_candidates = []
for row in sheet_rows["Técnicas RPG"]:
    species = resolve_species(row[0], row[1])
    if not species:
        continue
    technique_candidates.append(
        {
            "species": species["name"],
            "name": text(row[2]),
            "grade": stage_grade.get(text(row[1]), ""),
            "category": text(row[3]) or "Energia",
            "field": text(row[4]) or "Neutra",
            "power": int(row[5] or 0),
            "accuracy_formula": text(row[6]) or "DEX + Fight",
            "damage_formula": None if text(row[7]) in ("", "-") else text(row[7]),
            "ds_cost": int(row[8] or 0),
            "target": text(row[9]) or "1 alvo",
            "chance_dice": int(row[10] or 0),
            "description": text(row[11]),
        }
    )

# Flavor-only differences do not create duplicate signature techniques.
mechanical = {}
species_technique_keys = defaultdict(list)
for technique in technique_candidates:
    mechanical_key = "|".join(
        key(technique[field])
        for field in (
            "name", "grade", "category", "field", "accuracy_formula", "damage_formula", "target"
        )
    ) + f'|{technique["power"]}|{technique["ds_cost"]}|{technique["chance_dice"]}'
    current = mechanical.get(mechanical_key)
    if not current or len(technique["description"]) > len(current["description"]):
        mechanical[mechanical_key] = technique
    if mechanical_key not in species_technique_keys[technique["species"]]:
        species_technique_keys[technique["species"]].append(mechanical_key)

variant_counts = Counter((key(value["name"]), value["grade"]) for value in mechanical.values())
techniques = []
technique_identity = {}
for mechanical_key, technique in mechanical.items():
    variant = variant_counts[(key(technique["name"]), technique["grade"])] > 1
    origin = technique["species"] if variant else ""
    description_parts = []
    if technique["power"]:
        description_parts.append(f'Power {technique["power"]}.')
    if technique["chance_dice"]:
        description_parts.append(f'Chance Dice {technique["chance_dice"]}.')
    if technique["description"]:
        description_parts.append(technique["description"])
    record = {
        "mechanical_key": mechanical_key,
        "name": technique["name"],
        "origin": origin,
        "grade": technique["grade"],
        "ds_cost": technique["ds_cost"],
        "field": technique["field"],
        "category": technique["category"],
        "target": technique["target"],
        "accuracy_formula": technique["accuracy_formula"],
        "damage_formula": technique["damage_formula"],
        "description": " ".join(description_parts),
    }
    techniques.append(record)
    technique_identity[mechanical_key] = (record["name"], record["origin"], record["grade"])

species = []
links = []
for item in species_by_identity.values():
    technique_keys = species_technique_keys[item["name"]]
    signature_names = [technique_identity[value][0] for value in technique_keys]
    signature_fields = []
    for mechanical_key in technique_keys:
        field = mechanical[mechanical_key]["field"]
        if field and field not in signature_fields:
            signature_fields.append(field)
    primary_fields = signature_fields[:2] or item["available_fields"][:1] or ["Neutra"]
    species.append(
        {
            **item,
            "fields": primary_fields,
            "signature_technique": signature_names[0] if signature_names else None,
            "evolution_text": " ; ".join(routes_by_source[item["name"]]),
        }
    )
    for mechanical_key in technique_keys:
        name, origin, grade = technique_identity[mechanical_key]
        technique = next(value for value in techniques if value["mechanical_key"] == mechanical_key)
        links.append({"species_name": item["name"], **technique})


def json_sql(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("$catalog$", "$ catalog $")


def chunks(values, size):
    for index in range(0, len(values), size):
        yield values[index:index + size]


def species_sql(values):
    return f"""create temporary table _digirole_species_import (payload jsonb) on commit drop;
insert into _digirole_species_import values ($catalog${json_sql(values)}$catalog$::jsonb);

update public.digirole_species existing
set name = imported.name
from jsonb_to_recordset((select payload from _digirole_species_import)) as imported(source_name text,name text,stage text)
where lower(btrim(existing.name)) = lower(btrim(imported.source_name))
  and existing.stage = imported.stage
  and existing.name <> imported.name
  and not exists (select 1 from public.digirole_species occupied where lower(btrim(occupied.name))=lower(btrim(imported.name)));

update public.digirole_species existing set
  stage=imported.stage, fields=imported.fields, available_fields=imported.available_fields,
  hp_base=imported.hp_base, suggested_hp=imported.suggested_hp,
  stabilization_text=case when imported.stabilization_victories=0 then 'Automática.' else imported.stabilization_victories||' vitórias nesta forma.' end,
  stabilization_victories=imported.stabilization_victories,
  base_attrs=imported.base_attrs || jsonb_build_object('charisma',coalesce(nullif(existing.base_attrs->>'charisma','')::integer,1)),
  signature_technique=imported.signature_technique, evolution_text=imported.evolution_text, updated_at=now()
from jsonb_to_recordset((select payload from _digirole_species_import)) as imported(name text,stage text,fields text[],available_fields text[],hp_base integer,suggested_hp integer,stabilization_victories integer,base_attrs jsonb,signature_technique text,evolution_text text)
where lower(btrim(existing.name))=lower(btrim(imported.name));

insert into public.digirole_species(name,stage,fields,available_fields,hp_base,suggested_hp,stabilization_text,stabilization_victories,base_attrs,signature_technique,evolution_text)
select imported.name,imported.stage,imported.fields,imported.available_fields,imported.hp_base,imported.suggested_hp,
  case when imported.stabilization_victories=0 then 'Automática.' else imported.stabilization_victories||' vitórias nesta forma.' end,
  imported.stabilization_victories,imported.base_attrs||'{{"charisma":1}}'::jsonb,imported.signature_technique,imported.evolution_text
from jsonb_to_recordset((select payload from _digirole_species_import)) as imported(name text,stage text,fields text[],available_fields text[],hp_base integer,suggested_hp integer,stabilization_victories integer,base_attrs jsonb,signature_technique text,evolution_text text)
where not exists(select 1 from public.digirole_species existing where lower(btrim(existing.name))=lower(btrim(imported.name)));

update public.digirole_species_techniques link set is_signature=false
where link.species_id in (
  select catalog.id from public.digirole_species catalog
  join jsonb_to_recordset((select payload from _digirole_species_import)) as imported(name text)
    on lower(btrim(catalog.name))=lower(btrim(imported.name))
);
"""


def technique_sql(values):
    return f"""create temporary table _digirole_technique_import (payload jsonb) on commit drop;
insert into _digirole_technique_import values ($catalog${json_sql(values)}$catalog$::jsonb);
insert into public.digirole_techniques(name,origin,grade,ds_cost,field,category,target,accuracy_formula,damage_formula,description)
select name,'',grade,ds_cost,field,category,target,accuracy_formula,damage_formula,description
from jsonb_to_recordset((select payload from _digirole_technique_import)) as imported(mechanical_key text,name text,origin text,grade text,ds_cost integer,field text,category text,target text,accuracy_formula text,damage_formula text,description text)
on conflict do nothing;
"""


def link_sql(values):
    return f"""create temporary table _digirole_link_import (payload jsonb) on commit drop;
insert into _digirole_link_import values ($catalog${json_sql(values)}$catalog$::jsonb);
insert into public.digirole_species_techniques(species_id,technique_id,is_signature)
select species.id,technique.id,true
from jsonb_to_recordset((select payload from _digirole_link_import)) as imported(species_name text,name text,origin text,grade text,ds_cost integer,field text,category text,target text,accuracy_formula text,damage_formula text,description text)
join public.digirole_species species on lower(btrim(species.name))=lower(btrim(imported.species_name))
join public.digirole_techniques technique on
  lower(btrim(technique.name))=lower(btrim(imported.name))
  and lower(btrim(technique.grade))=lower(btrim(imported.grade))
  and technique.ds_cost=imported.ds_cost
  and lower(btrim(technique.field))=lower(btrim(imported.field))
  and lower(btrim(technique.category))=lower(btrim(imported.category))
  and lower(btrim(technique.target))=lower(btrim(imported.target))
  and lower(btrim(technique.accuracy_formula))=lower(btrim(imported.accuracy_formula))
  and lower(btrim(coalesce(technique.damage_formula,'')))=lower(btrim(coalesce(imported.damage_formula,'')))
  and md5(lower(btrim(technique.description)))=md5(lower(btrim(imported.description)))
on conflict(species_id,technique_id) do update set is_signature=true;
"""


legacy_sql = f"""-- Generated from {source.name}. Updates the DigiRole catalog without deleting existing sheets.
create temporary table _digirole_species_import (payload jsonb) on commit drop;
insert into _digirole_species_import values ($catalog${json_sql(species)}$catalog$::jsonb);

-- Preserve same-name forms by adding the stage only when the source uses that name in multiple stages.
update public.digirole_species existing
set name = imported.name
from jsonb_to_recordset((select payload from _digirole_species_import)) as imported(source_name text,name text,stage text)
where lower(btrim(existing.name)) = lower(btrim(imported.source_name))
  and existing.stage = imported.stage
  and existing.name <> imported.name
  and not exists (select 1 from public.digirole_species occupied where lower(btrim(occupied.name))=lower(btrim(imported.name)));

update public.digirole_species existing set
  stage=imported.stage,
  fields=imported.fields,
  available_fields=imported.available_fields,
  hp_base=imported.hp_base,
  suggested_hp=imported.suggested_hp,
  stabilization_text=case when imported.stabilization_victories=0 then 'Automática.' else imported.stabilization_victories||' vitórias nesta forma.' end,
  stabilization_victories=imported.stabilization_victories,
  base_attrs=imported.base_attrs || jsonb_build_object('charisma',coalesce(nullif(existing.base_attrs->>'charisma','')::integer,1)),
  signature_technique=imported.signature_technique,
  evolution_text=imported.evolution_text,
  updated_at=now()
from jsonb_to_recordset((select payload from _digirole_species_import)) as imported(name text,stage text,fields text[],available_fields text[],hp_base integer,suggested_hp integer,stabilization_victories integer,base_attrs jsonb,signature_technique text,evolution_text text)
where lower(btrim(existing.name))=lower(btrim(imported.name));

insert into public.digirole_species(name,stage,fields,available_fields,hp_base,suggested_hp,stabilization_text,stabilization_victories,base_attrs,signature_technique,evolution_text)
select imported.name,imported.stage,imported.fields,imported.available_fields,imported.hp_base,imported.suggested_hp,
  case when imported.stabilization_victories=0 then 'Automática.' else imported.stabilization_victories||' vitórias nesta forma.' end,
  imported.stabilization_victories,imported.base_attrs||'{{"charisma":1}}'::jsonb,imported.signature_technique,imported.evolution_text
from jsonb_to_recordset((select payload from _digirole_species_import)) as imported(name text,stage text,fields text[],available_fields text[],hp_base integer,suggested_hp integer,stabilization_victories integer,base_attrs jsonb,signature_technique text,evolution_text text)
where not exists(select 1 from public.digirole_species existing where lower(btrim(existing.name))=lower(btrim(imported.name)));

create temporary table _digirole_technique_import (payload jsonb) on commit drop;
insert into _digirole_technique_import values ($catalog${json_sql(techniques)}$catalog$::jsonb);
insert into public.digirole_techniques(name,origin,grade,ds_cost,field,category,target,accuracy_formula,damage_formula,description)
select name,origin,grade,ds_cost,field,category,target,accuracy_formula,damage_formula,description
from jsonb_to_recordset((select payload from _digirole_technique_import)) as imported(mechanical_key text,name text,origin text,grade text,ds_cost integer,field text,category text,target text,accuracy_formula text,damage_formula text,description text)
on conflict(name,origin,grade) do update set ds_cost=excluded.ds_cost,field=excluded.field,category=excluded.category,target=excluded.target,accuracy_formula=excluded.accuracy_formula,damage_formula=excluded.damage_formula,description=excluded.description;

create temporary table _digirole_link_import (payload jsonb) on commit drop;
insert into _digirole_link_import values ($catalog${json_sql(links)}$catalog$::jsonb);
update public.digirole_species_techniques link set is_signature=false
where link.species_id in (select species.id from public.digirole_species species join jsonb_to_recordset((select payload from _digirole_species_import)) as imported(name text) on lower(btrim(species.name))=lower(btrim(imported.name)));
insert into public.digirole_species_techniques(species_id,technique_id,is_signature)
select species.id,technique.id,true
from jsonb_to_recordset((select payload from _digirole_link_import)) as imported(species_name text,name text,origin text,grade text)
join public.digirole_species species on lower(btrim(species.name))=lower(btrim(imported.species_name))
join public.digirole_techniques technique on technique.name=imported.name and technique.origin=imported.origin and technique.grade=imported.grade
on conflict(species_id,technique_id) do update set is_signature=true;

-- Refresh signature techniques on existing sheets while keeping learned generic techniques.
delete from public.digirole_digimon_techniques where source='signature';
insert into public.digirole_digimon_techniques(digimon_id,technique_id,source)
select digimon.id,link.technique_id,'signature'
from public.digirole_digimons digimon join public.digirole_species_techniques link on link.species_id=digimon.species_id and link.is_signature
on conflict(digimon_id,technique_id) do update set source='signature';

notify pgrst, 'reload schema';
"""

finalize_sql = """-- Refresh signature techniques on existing sheets while keeping learned generic techniques.
delete from public.digirole_digimon_techniques where source='signature';
insert into public.digirole_digimon_techniques(digimon_id,technique_id,source)
select digimon.id,link.technique_id,'signature'
from public.digirole_digimons digimon
join public.digirole_species_techniques link on link.species_id=digimon.species_id and link.is_signature
on conflict(digimon_id,technique_id) do update set source='signature';
notify pgrst, 'reload schema';
"""
sql = (
    f"-- Generated from {source.name}. Updates the DigiRole catalog without deleting existing sheets.\n"
    + species_sql(species)
    + technique_sql(techniques)
    + link_sql(links)
    + finalize_sql
)

destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(sql, encoding="utf-8")

# The Supabase web editor rejects multi-megabyte queries. These standalone,
# ordered files provide the same import in editor-friendly pieces.
manual_dir = destination.parent.parent / "manual" / f"{destination.stem}_parts"
manual_dir.mkdir(parents=True, exist_ok=True)
for old_part in manual_dir.glob("*.sql"):
    old_part.unlink()

part_number = 1
for values in chunks(species, 100):
    (manual_dir / f"{part_number:02d}_species.sql").write_text(
        f"-- Part {part_number}: DigiRole species catalog.\n{species_sql(values)}",
        encoding="utf-8",
    )
    part_number += 1
for values in chunks(techniques, 250):
    (manual_dir / f"{part_number:02d}_techniques.sql").write_text(
        f"-- Part {part_number}: DigiRole techniques catalog.\n{technique_sql(values)}",
        encoding="utf-8",
    )
    part_number += 1
for values in chunks(links, 400):
    (manual_dir / f"{part_number:02d}_signature_links.sql").write_text(
        f"-- Part {part_number}: DigiRole signature technique links.\n{link_sql(values)}",
        encoding="utf-8",
    )
    part_number += 1

(manual_dir / f"{part_number:02d}_finalize.sql").write_text(finalize_sql, encoding="utf-8")

print(json.dumps({"species": len(species), "techniques": len(techniques), "links": len(links), "routes": route_count, "destination": str(destination), "manual_parts": part_number, "manual_directory": str(manual_dir)}, ensure_ascii=False))
