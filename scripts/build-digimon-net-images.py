import http.cookiejar
import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import openpyxl


if len(sys.argv) != 4:
    raise SystemExit(
        "Usage: build-digimon-net-images.py <catalog.xlsx> <migration.sql> <generated.ts>"
    )

source = Path(sys.argv[1])
migration = Path(sys.argv[2])
generated = Path(sys.argv[3])

OFFICIAL_BASE = "https://digimon.net/reference_en/"
OFFICIAL_IMAGE_BASE = "https://digimon.net/cimages/digimon"
ALIASES = {
    "Agumon Saviors": "Agumon (2006 Anime Version)",
    "Falcomon Saviors": "Falcomon (2006 Anime Version)",
    "Kudamon Saviors": "Kudamon (2006 Anime Version)",
    "Crowmon Saviors": "Crowmon (2006 Anime Version)",
    "KaiserLeomon": "JagerLoweemon",
    "Lowemon": "Loweemon",
    "Ranamon": "Lanamon",
    "Sakkakumon": "Sephirothmon",
    "Velgemon": "Velgrmon",
    "BACCHUSMON DM": "Bacchusmon",
    "BELPHEMON SM": "Belphemon: Sleep Mode",
    "CERESMON MEDIUM": "Ceresmon",
    "CHRONOMON DM": "Chronomon: Destroy Mode",
    "CHRONOMON HM": "Chronomon: Holy Mode",
    "IMPERIALDRAMON DM": "Imperialdramon: Dragon Mode",
    "IMPERIALDRAMON FM": "Imperialdramon: Fighter Mode",
    "JUNOMON HM": "Junomon: Hysteric Mode",
    "JUSTIMON": "Justimon: Accel Arm",
    "LEOPARDMON LM": "Leopardmon: Leopard Mode",
    "ALPHAMON OURYUKEN": "Alphamon: Ouryuken",
    "BEELZEMON BM": "Beelzemon: Blast Mode",
    "BELPHEMON RM": "Belphemon: Rage Mode",
    "CHAOSMON VALDUR ARM": "Chaosmon: Valdur Arm",
    "GALLANTMON CM": "Gallantmon: Crimson Mode",
    "IMPERIALDRAMON PM": "Imperialdramon: Paladin Mode",
    "JUPITERMON WM": "Jupitermon: Wrath Mode",
    "LUCEMON SM": "Lucemon: Satan Mode",
    "MIRAGEGAOGAMON BM": "MirageGaogamon: Burst Mode",
    "OMNIMON MM": "Omnimon: Merciful Mode",
    "RAVEMON BM": "Ravemon: Burst Mode",
    "ROSEMON BM": "Rosemon: Burst Mode",
    "SHINEGREYMON BM": "ShineGreymon: Burst Mode",
    "AEGIOCHUSMON BLUE": "Aegiochusmon: Blue",
    "AEGIOCHUSMON DARK": "Aegiochusmon: Dark",
    "AEGIOCHUSMON GREEN": "Aegiochusmon: Green",
    "AEGIOCHUSMON HOLY": "Aegiochusmon: Holy",
    "CERBERUSMON WM": "Cerberusmon: Werewolf Mode",
    "LUCEMON CM": "Lucemon: Chaos Mode",
    "MEGAKABUTERIMON": "MegaKabuterimon (Red)",
    "METALGREYMON": "MetalGreymon (Vaccine)",
    "METALGREYMON (BLUE)": "MetalGreymon (Virus)",
}

LEGACY_SPECIES = [
    (name, "Hybrid")
    for name in (
        "Agunimon",
        "Arbormon",
        "Beetlemon",
        "BurningGreymon",
        "Calmaramon",
        "Duskmon",
        "Gigasmon",
        "Grumblemon",
        "KaiserLeomon",
        "Kazemon",
        "KendoGarurumon",
        "Korikakumon",
        "Kumamon",
        "Lobomon",
        "Lowemon",
        "Mercurymon",
        "MetalKabuterimon",
        "Petaldramon",
        "Ranamon",
        "Sakkakumon",
        "Velgemon",
        "Zephyrmon",
    )
] + [
    ("BACCHUSMON DM", "Mega"),
    ("BELPHEMON SM", "Mega"),
    ("CERESMON MEDIUM", "Mega"),
    ("CHRONOMON DM", "Mega"),
    ("CHRONOMON HM", "Mega"),
    ("IMPERIALDRAMON DM", "Mega"),
    ("IMPERIALDRAMON FM", "Mega"),
    ("JUNOMON HM", "Mega"),
    ("JUSTIMON", "Mega"),
    ("LEOPARDMON LM", "Mega"),
    ("ALPHAMON OURYUKEN", "Mega+"),
    ("BEELZEMON BM", "Mega+"),
    ("BELPHEMON RM", "Mega+"),
    ("CHAOSMON VALDUR ARM", "Mega+"),
    ("GALLANTMON CM", "Mega+"),
    ("IMPERIALDRAMON PM", "Mega+"),
    ("JUPITERMON WM", "Mega+"),
    ("LUCEMON SM", "Mega+"),
    ("MIRAGEGAOGAMON BM", "Mega+"),
    ("OMNIMON MM", "Mega+"),
    ("RAVEMON BM", "Mega+"),
    ("ROSEMON BM", "Mega+"),
    ("SHINEGREYMON BM", "Mega+"),
    ("AEGIOCHUSMON BLUE", "Ultimate"),
    ("AEGIOCHUSMON DARK", "Ultimate"),
    ("AEGIOCHUSMON GREEN", "Ultimate"),
    ("AEGIOCHUSMON HOLY", "Ultimate"),
    ("CERBERUSMON WM", "Ultimate"),
    ("LUCEMON CM", "Ultimate"),
    ("MEGAKABUTERIMON", "Ultimate"),
    ("METALGREYMON", "Ultimate"),
    ("METALGREYMON (BLUE)", "Ultimate"),
]


def text(value):
    return "" if value is None else str(value).strip()


def normalized(value):
    ascii_value = (
        unicodedata.normalize("NFKD", text(value)).encode("ascii", "ignore").decode()
    )
    return re.sub(
        r"[^a-z0-9]+",
        "",
        ascii_value.lower().replace("&", "and").replace("x-antibody", "x antibody"),
    )


def normalized_stage(value):
    return normalized(
        text(value)
        .replace("Ⅰ", "I")
        .replace("Ⅱ", "II")
        .replace("Ⅲ", "III")
        .replace("Ⅳ", "IV")
        .replace("Ⅴ", "V")
        .replace("Ⅵ", "VI")
    )


def fetch_official_catalog():
    cookies = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    headers = {
        "User-Agent": "D20Project-CatalogBuilder/1.0",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
    }
    opener.open(urllib.request.Request(OFFICIAL_BASE, headers=headers), timeout=30).read()

    rows = []
    next_offset = 0
    while next_offset != -1:
        query = urllib.parse.urlencode(
            {
                "digimon_name": "",
                "name": "",
                "digimon_level": "",
                "attribute": "",
                "type": "",
                "next": str(next_offset),
            }
        )
        request = urllib.request.Request(
            f"{OFFICIAL_BASE}request.php?{query}",
            headers={**headers, "Referer": OFFICIAL_BASE},
        )
        payload = json.loads(opener.open(request, timeout=30).read())
        rows.extend(payload.get("rows", []))
        next_offset = payload.get("next", -1)
    return rows


workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
forms = [
    row
    for row in workbook["Fichas RPG"].iter_rows(min_row=5, values_only=True)
    if text(row[0])
]

name_stages = defaultdict(set)
for row in forms:
    name_stages[normalized(row[0])].add(text(row[1]))


def canonical_name(name, stage):
    clean_name = text(name)
    if len(name_stages[normalized(clean_name)]) > 1:
        return f"{clean_name} ({text(stage)})"
    return clean_name


official_rows = fetch_official_catalog()
official_by_name = defaultdict(list)
for row in official_rows:
    official_by_name[normalized(row.get("name"))].append(row)


def resolve_official(name, stage):
    official_name = ALIASES.get(text(name), text(name))
    candidates = official_by_name[normalized(official_name)]
    if not candidates:
        return None
    same_stage = [
        row
        for row in candidates
        if normalized_stage(row.get("level")) == normalized_stage(stage)
    ]
    choices = same_stage or candidates
    choices.sort(
        key=lambda row: (
            normalized(row.get("directory_name")) != normalized(official_name),
            text(row.get("directory_name")),
        )
    )
    return choices[0]


images_by_name = {}
missing = []
for row in forms:
    source_name, stage = text(row[0]), text(row[1])
    name = canonical_name(source_name, stage)
    official = resolve_official(source_name, stage)
    if not official:
        missing.append(f"{name} [{stage}]")
        continue
    images_by_name[name] = (
        f"{OFFICIAL_IMAGE_BASE}/{official['directory_name']}.jpg"
    )

for name, stage in LEGACY_SPECIES:
    official = resolve_official(name, stage)
    if not official:
        missing.append(f"{name} [{stage}]")
        continue
    images_by_name[name] = f"{OFFICIAL_IMAGE_BASE}/{official['directory_name']}.jpg"

if missing:
    raise SystemExit("Official images not found:\n" + "\n".join(sorted(set(missing))))

records = [
    {"name": name, "image_url": image_url}
    for name, image_url in sorted(images_by_name.items(), key=lambda item: item[0].casefold())
]
payload = json.dumps(records, ensure_ascii=False, separators=(",", ":")).replace(
    "$images$", "$ images $"
)

sql = f"""-- Official DigiRole images from the Digimon Encyclopedia at digimon.net.
create temporary table _digimon_net_images (payload jsonb) on commit drop;
insert into _digimon_net_images values ($images${payload}$images$::jsonb);

update public.digirole_species species
set image_url=official.image_url, updated_at=now()
from jsonb_to_recordset((select payload from _digimon_net_images))
  as official(name text,image_url text)
where lower(btrim(species.name))=lower(btrim(official.name));

-- Replace only missing or previously automatic images. User uploads and custom URLs are preserved.
update public.digirole_digimons digimon
set image_url=species.image_url, updated_at=now()
from public.digirole_species species
where digimon.species_id=species.id
  and species.image_url is not null
  and not coalesce(digimon.image_hidden,false)
  and (
    digimon.image_url is null
    or digimon.image_url ~* '^https?://(www\\.)?(digi-api\\.com|digimon\\.shadowsmith\\.com|digimon\\.net)/'
  );

update public.tokens token
set image_url=digimon.image_url
from public.digirole_digimons digimon
where token.character_kind='digirole_digimon'
  and token.character_id=digimon.id
  and digimon.image_url is not null
  and (
    token.image_url is null
    or token.image_url ~* '^https?://(www\\.)?(digi-api\\.com|digimon\\.shadowsmith\\.com|digimon\\.net)/'
  );
"""


def ts_key(value):
    return normalized(value)


typescript_images = {}
for name, url in images_by_name.items():
    key = ts_key(name)
    existing = typescript_images.get(key)
    if existing and existing != url:
        raise SystemExit(f"Conflicting official images for {name}: {existing} / {url}")
    typescript_images[key] = url

ts_entries = "\n".join(
    f"  {json.dumps(key)}: {json.dumps(url)},"
    for key, url in sorted(typescript_images.items())
)
typescript = f"""// Generated by scripts/build-digimon-net-images.py from the official Digimon Encyclopedia.
const DIGIMON_NET_IMAGES: Record<string, string> = {{
{ts_entries}
}};

function imageKey(value: string) {{
  return value
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, "and")
    .replace(/x[- ]?antibody/g, "x antibody")
    .replace(/[^a-z0-9]+/g, "");
}}

export function digimonNetImageUrl(name: string): string | null {{
  return DIGIMON_NET_IMAGES[imageKey(name)] ?? null;
}}
"""

migration.parent.mkdir(parents=True, exist_ok=True)
generated.parent.mkdir(parents=True, exist_ok=True)
migration.write_text(sql, encoding="utf-8")
generated.write_text(typescript, encoding="utf-8")
print(
    json.dumps(
        {
            "official_entries": len(official_rows),
            "mapped_species": len(records),
            "migration": str(migration),
            "generated": str(generated),
        },
        ensure_ascii=False,
    )
)
