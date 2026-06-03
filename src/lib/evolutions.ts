// Auto-generated from evolução.xlsx — do not hand-edit.
export type EvolutionKind = "time" | "item" | "happiness_loyalty" | "trade" | "attribute" | "specific";
export type EvolutionRule = {
  from: string; to: string;
  kinds: EvolutionKind[];
  time?: "fast" | "medium" | "slow";
  items?: string[];
  happiness?: number;
  loyalty?: number;
  attribute?: string;
  specific?: string;
};

export const EVOLUTION_RULES: EvolutionRule[] = [
  {
    "from": "Bulbasaur",
    "to": "Ivysaur",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Ivysaur",
    "to": "Venusaur",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Charmander",
    "to": "Charmeleon",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Charmeleon",
    "to": "Charizard",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Squirtle",
    "to": "Wartortle",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Wartortle",
    "to": "Blastoise",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Caterpie",
    "to": "Metapod",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "Metapod",
    "to": "Butterfree",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "Weedle",
    "to": "Kakuna",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "Kakuna",
    "to": "Beedrill",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "Pidgey",
    "to": "Pidgeotto",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Pidgeotto",
    "to": "Pidgeot",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Rattata",
    "to": "Raticate",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Rattata (Alola)",
    "to": "Raticate (Alola)",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Spearow",
    "to": "Fearow",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Ekans",
    "to": "Arbok",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Pikachu",
    "to": "Raichu",
    "kinds": [
      "item"
    ],
    "items": [
      "Thunder stone"
    ]
  },
  {
    "from": "Pikachu",
    "to": "Raichu (Alola)",
    "kinds": [
      "item"
    ],
    "items": [
      "Thunder stone"
    ]
  },
  {
    "from": "Sandshrew",
    "to": "Sandslash",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Sandshrew (Alola)",
    "to": "Sandslash (Alola)",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Nidoran Femea",
    "to": "Nidorina",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Nidorina",
    "to": "Nidoqueen",
    "kinds": [
      "item"
    ],
    "items": [
      "moon stone"
    ]
  },
  {
    "from": "Nidoran Macho",
    "to": "Nidorino",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Nidorino",
    "to": "Nidoking",
    "kinds": [
      "item"
    ],
    "items": [
      "moon stone"
    ]
  },
  {
    "from": "Clefairy",
    "to": "Clefable",
    "kinds": [
      "item"
    ],
    "items": [
      "moon stone"
    ]
  },
  {
    "from": "Vulpix",
    "to": "Ninetales",
    "kinds": [
      "item"
    ],
    "items": [
      "fire stone"
    ]
  },
  {
    "from": "Vulpix (Alola)",
    "to": "Ninetales  (Alola)",
    "kinds": [
      "item"
    ],
    "items": [
      "ice stone"
    ]
  },
  {
    "from": "Jigglypuff",
    "to": "Wigglytuff",
    "kinds": [
      "item"
    ],
    "items": [
      "moon stone"
    ]
  },
  {
    "from": "Zubat",
    "to": "Golbat",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Golbat",
    "to": "Crobat",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 4
  },
  {
    "from": "Oddish",
    "to": "Gloom",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Gloom",
    "to": "Vileplume",
    "kinds": [
      "item"
    ],
    "items": [
      "Leaf stone"
    ]
  },
  {
    "from": "Gloom",
    "to": "Bellossom",
    "kinds": [
      "item"
    ],
    "items": [
      "sun stone"
    ]
  },
  {
    "from": "Paras",
    "to": "Parasect",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Venonat",
    "to": "Venomoth",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Diglett",
    "to": "Dugtrio",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Diglett (Alola)",
    "to": "Dugtrio (Alola)",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Meowth",
    "to": "Persian",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Meowth (Alola)",
    "to": "Persian (Alola)",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Psyduck",
    "to": "Golduck",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Mankey",
    "to": "Primeape",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Growlithe",
    "to": "Arcanine",
    "kinds": [
      "item"
    ],
    "items": [
      "fire stone"
    ]
  },
  {
    "from": "Poliwag",
    "to": "Poliwhirl",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Poliwhirl",
    "to": "Poliwrath",
    "kinds": [
      "item"
    ],
    "items": [
      "water stone"
    ]
  },
  {
    "from": "Poliwhirl",
    "to": "Politoed",
    "kinds": [
      "item"
    ],
    "items": [
      "kings rock"
    ]
  },
  {
    "from": "Abra",
    "to": "Kadabra",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Kadabra",
    "to": "Alakazam",
    "kinds": [
      "trade"
    ]
  },
  {
    "from": "Machop",
    "to": "Machoke",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Machoke",
    "to": "Machamp",
    "kinds": [
      "trade"
    ]
  },
  {
    "from": "Bellsprout",
    "to": "Weepinbell",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Weepinbell",
    "to": "Victreebel",
    "kinds": [
      "item"
    ],
    "items": [
      "leaf stone"
    ]
  },
  {
    "from": "Tentacool",
    "to": "Tentacruel",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Geodude",
    "to": "Graveler",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Geodude (Alola)",
    "to": "Graveler (Alola)",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Graveler",
    "to": "Golem",
    "kinds": [
      "trade"
    ]
  },
  {
    "from": "Graveler (Alola)",
    "to": "Golem (Alola)",
    "kinds": [
      "trade"
    ]
  },
  {
    "from": "Ponyta",
    "to": "Rapidash",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Slowpoke",
    "to": "Slowbro",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Slowpoke",
    "to": "Slowking",
    "kinds": [
      "item"
    ],
    "items": [
      "kings rock"
    ]
  },
  {
    "from": "Magnemite",
    "to": "Magneton",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Magneton",
    "to": "Magnezone",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Doduo",
    "to": "Dodrio",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Seel",
    "to": "Dewgong",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Grimer",
    "to": "Muk",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Grimer (Alola)",
    "to": "Muk (Alola)",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Shellder",
    "to": "Cloyster",
    "kinds": [
      "item"
    ],
    "items": [
      "water stone"
    ]
  },
  {
    "from": "Gastly",
    "to": "Haunter",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Haunter",
    "to": "Gengar",
    "kinds": [
      "trade"
    ]
  },
  {
    "from": "Onix",
    "to": "Steelix",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "metal coat"
    ]
  },
  {
    "from": "Drowzee",
    "to": "Hypno",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Krabby",
    "to": "Kingler",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Voltorb",
    "to": "Electrode",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Exeggcute",
    "to": "Exeggutor",
    "kinds": [
      "item"
    ],
    "items": [
      "leaf stone"
    ]
  },
  {
    "from": "Exeggcute",
    "to": "Exeggutor (Alola)",
    "kinds": [
      "item"
    ],
    "items": [
      "leaf stone"
    ]
  },
  {
    "from": "Cubone",
    "to": "Marowak",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Lickitung",
    "to": "Lickilicky",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Koffing",
    "to": "Weezing",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Koffing",
    "to": "Weezing (Galar)",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Rhyhorn",
    "to": "Rhydon",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Rhydon",
    "to": "Rhyperior",
    "kinds": [
      "item",
      "trade"
    ]
  },
  {
    "from": "Chansey",
    "to": "Blissey",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 5
  },
  {
    "from": "Tangela",
    "to": "Tangrowth",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Horsea",
    "to": "Seadra",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Seadra",
    "to": "Kingdra",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "dragon scale"
    ]
  },
  {
    "from": "Goldeen",
    "to": "Seaking",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Staryu",
    "to": "Starmie",
    "kinds": [
      "item"
    ],
    "items": [
      "water stone"
    ]
  },
  {
    "from": "Scyther",
    "to": "Scizor",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "metal coat"
    ]
  },
  {
    "from": "Electabuzz",
    "to": "Electivire",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "electririzer"
    ]
  },
  {
    "from": "Magmar",
    "to": "Magmortar",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "magmarizer"
    ]
  },
  {
    "from": "Magikarp",
    "to": "Gyarados",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Eevee",
    "to": "Vaporeon",
    "kinds": [
      "item"
    ],
    "items": [
      "water stone"
    ]
  },
  {
    "from": "Eevee",
    "to": "Jolteon",
    "kinds": [
      "item"
    ],
    "items": [
      "thunder stone"
    ]
  },
  {
    "from": "Eevee",
    "to": "Flareon",
    "kinds": [
      "item"
    ],
    "items": [
      "fire stone"
    ]
  },
  {
    "from": "Eevee",
    "to": "Espeon",
    "kinds": [
      "happiness_loyalty",
      "specific"
    ],
    "happiness": 4,
    "specific": "Dia"
  },
  {
    "from": "Eevee",
    "to": "Umbreon",
    "kinds": [
      "happiness_loyalty",
      "specific"
    ],
    "happiness": 4,
    "specific": "Noite"
  },
  {
    "from": "Eevee",
    "to": "Glaceon",
    "kinds": [
      "item"
    ],
    "items": [
      "ice stone"
    ]
  },
  {
    "from": "Eevee",
    "to": "Leafeon",
    "kinds": [
      "item"
    ],
    "items": [
      "leaf stone"
    ]
  },
  {
    "from": "Eevee",
    "to": "Sylveon",
    "kinds": [
      "happiness_loyalty"
    ]
  },
  {
    "from": "Porygon",
    "to": "Porygon 2",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "upgrade"
    ]
  },
  {
    "from": "Omanyte",
    "to": "Omastar",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Kabuto",
    "to": "Kabutops",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Dratini",
    "to": "Dragonair",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Dragonair",
    "to": "Dragonite",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Chikorita",
    "to": "Bayleef",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Bayleef",
    "to": "Meganium",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Cyndaquil",
    "to": "Quilava",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Quilava",
    "to": "Typhlosion",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Totodile",
    "to": "Croconaw",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Croconaw",
    "to": "Feraligatr",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Sentret",
    "to": "Furret",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Hoothoot",
    "to": "Noctowl",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Ledyba",
    "to": "Ledian",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Spinarak",
    "to": "Ariados",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Chinchou",
    "to": "Lanturn",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Pichu",
    "to": "Pikachu",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 4
  },
  {
    "from": "Cleffa",
    "to": "Clefairy",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 4
  },
  {
    "from": "Igglybuff",
    "to": "Jigglypuff",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 4
  },
  {
    "from": "Togepi",
    "to": "Togetic",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 5
  },
  {
    "from": "Togetic",
    "to": "Togekiss",
    "kinds": [
      "item"
    ],
    "items": [
      "shine stone"
    ]
  },
  {
    "from": "Natu",
    "to": "Xatu",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Mareep",
    "to": "Flaafy",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Flaafy",
    "to": "Ampharos",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Marill",
    "to": "Azumarill",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Hoppip",
    "to": "Skiploom",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Skiploom",
    "to": "Jumpluff",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Aipom",
    "to": "Ambipom",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Sunkern",
    "to": "Sunflora",
    "kinds": [
      "item"
    ],
    "items": [
      "sun stone"
    ]
  },
  {
    "from": "Yanma",
    "to": "Yanmega",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Wooper",
    "to": "Quagsire",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Murkrow",
    "to": "Honchkrow",
    "kinds": [
      "item"
    ],
    "items": [
      "dusk stone"
    ]
  },
  {
    "from": "Misdreavus",
    "to": "Mismagius",
    "kinds": [
      "item"
    ],
    "items": [
      "dusk stone"
    ]
  },
  {
    "from": "Pineco",
    "to": "Forretress",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Gligar",
    "to": "Gliscor",
    "kinds": [
      "item"
    ],
    "items": [
      "razor fang"
    ]
  },
  {
    "from": "Snubbull",
    "to": "Granbull",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Sneasel",
    "to": "Weavile",
    "kinds": [
      "time"
    ],
    "time": "medium",
    "items": [
      "razor claw"
    ]
  },
  {
    "from": "Teddiursa",
    "to": "Ursaring",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Slugma",
    "to": "Magcargo",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Swinub",
    "to": "Piloswine",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Piloswine",
    "to": "Mamoswine",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Remoraid",
    "to": "Octillery",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Houndour",
    "to": "Houndoom",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Phanpy",
    "to": "Donphan",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Porygon 2",
    "to": "Porygon-Z",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "upgrade 2"
    ]
  },
  {
    "from": "Tyrogue",
    "to": "Hitmonchan",
    "kinds": [
      "attribute"
    ],
    "attribute": "vit"
  },
  {
    "from": "Tyrogue",
    "to": "Hitmonlee",
    "kinds": [
      "attribute"
    ],
    "attribute": "atk"
  },
  {
    "from": "Tyrogue",
    "to": "Hitmontop",
    "kinds": [
      "attribute"
    ],
    "attribute": "dex"
  },
  {
    "from": "Smoochum",
    "to": "Jinx",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Elekid",
    "to": "Electrode",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Magby",
    "to": "Magma",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Larvitar",
    "to": "Pupitar",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Pupitar",
    "to": "Tyranitar",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Treecko",
    "to": "Grovyle",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Grovyle",
    "to": "Sceptile",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Torchic",
    "to": "Combusken",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Combusken",
    "to": "Blaziken",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Mudkip",
    "to": "Marshtomp",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Marshtomp",
    "to": "Swampert",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Poochyena",
    "to": "Mightyena",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Zigzagoon",
    "to": "Linoone",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Wurmple",
    "to": "Silcoon",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "Wurmple",
    "to": "Cascoon",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "Silcoon",
    "to": "Beautifly",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "Cascoon",
    "to": "Dustox",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "Lotad",
    "to": "Lombre",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Lombre",
    "to": "Ludicolo",
    "kinds": [
      "item"
    ],
    "items": [
      "water stone"
    ]
  },
  {
    "from": "Seedot",
    "to": "Nuzleaf",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Nuzleaf",
    "to": "Shiftry",
    "kinds": [
      "item"
    ],
    "items": [
      "leaf stone"
    ]
  },
  {
    "from": "Tailow",
    "to": "Swellow",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Wingull",
    "to": "Pelipper",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Ralts",
    "to": "Kirlia",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Kirlia",
    "to": "Gardevoir",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Kirlia",
    "to": "Gallade",
    "kinds": [
      "item",
      "specific"
    ],
    "items": [
      "dawn stone"
    ],
    "specific": "Macho"
  },
  {
    "from": "Surskit",
    "to": "Masquerain",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "Shroomish",
    "to": "Breloom",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Slakoth",
    "to": "Vigoroth",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Vigoroth",
    "to": "Slaking",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "Nincada",
    "to": "Ninjask",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Nincada",
    "to": "Shedinja",
    "kinds": [
      "specific"
    ],
    "specific": "espaço vazio no time quando nincada evolui para ninjask"
  },
  {
    "from": "Whismur",
    "to": "Loudred",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Loudred",
    "to": "Exploud",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Makuhita",
    "to": "Hariyama",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Azurill",
    "to": "Marill",
    "kinds": [
      "happiness_loyalty"
    ],
    "time": "medium",
    "happiness": 4
  },
  {
    "from": "Nosepass",
    "to": "Probopass",
    "kinds": [
      "specific"
    ],
    "specific": "A trip to New Mauville."
  },
  {
    "from": "Skitty",
    "to": "Delcatty",
    "kinds": [
      "item"
    ],
    "items": [
      "moon stone"
    ]
  },
  {
    "from": "Aron",
    "to": "Lairon",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Lairon",
    "to": "Aggron",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Meditite",
    "to": "Medicham",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Electrike",
    "to": "Manectric",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Roselia",
    "to": "Roserade",
    "kinds": [
      "item"
    ],
    "items": [
      "shine stone"
    ]
  },
  {
    "from": "Gulpin",
    "to": "Swalot",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Carvanha",
    "to": "Sharpedo",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Wailmer",
    "to": "Wailord",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Numel",
    "to": "Camerupt",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Spoink",
    "to": "Grumpig",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Trapinch",
    "to": "Vibrava",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Vibrava",
    "to": "Flygon",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Cacnea",
    "to": "Cacturne",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Swablu",
    "to": "Altaria",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Barboach",
    "to": "Wishcash",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Corphish",
    "to": "Crawdaunt",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Baltoy",
    "to": "Claydol",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Lileep",
    "to": "Cradily",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Anorith",
    "to": "Armaldo",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Feebas",
    "to": "Milotic",
    "kinds": [
      "attribute"
    ],
    "time": "medium",
    "attribute": "beauty"
  },
  {
    "from": "Shuppet",
    "to": "Banette",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Duskull",
    "to": "Dusclops",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Dusclops",
    "to": "Dusknoir",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "Reaper Cloth"
    ]
  },
  {
    "from": "Wynaut",
    "to": "Wobbuffet",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Snorunt",
    "to": "Glalie",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Snorunt",
    "to": "Froslass",
    "kinds": [
      "item",
      "specific"
    ],
    "items": [
      "dawn stone"
    ],
    "specific": "Femea"
  },
  {
    "from": "Spheal",
    "to": "Sealeo",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Sealeo",
    "to": "Walrein",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Clamperl",
    "to": "Gorebyss",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "Dragon Scale."
    ]
  },
  {
    "from": "Clamperl",
    "to": "Huntail",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "Dragon Fang."
    ]
  },
  {
    "from": "Bagon",
    "to": "Shelgon",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Shelgon",
    "to": "Salamence",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "Beldum",
    "to": "Metang",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Metang",
    "to": "Metagross",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "turtwig",
    "to": "grotle",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "grotle",
    "to": "Torterra",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "chinchar",
    "to": "Monferno",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "monferno",
    "to": "Infernape",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "piplup",
    "to": "Prinplup",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "prinplup",
    "to": "Empoleon",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "starly",
    "to": "Staravia",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "staravia",
    "to": "Staraptor",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "bidoof",
    "to": "Bibarel",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "kricketot",
    "to": "Kricketune",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "shinx",
    "to": "Luxio",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "luxio",
    "to": "Luxray",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "budew",
    "to": "Roselia",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 4
  },
  {
    "from": "cranidos",
    "to": "Rampardos",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "shieldon",
    "to": "Bastiodon",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Burmy",
    "to": "Wormadam (grass)",
    "kinds": [
      "time"
    ],
    "time": "fast",
    "specific": "Femea"
  },
  {
    "from": "Burmy",
    "to": "Wormadam (steel)",
    "kinds": [
      "time"
    ],
    "time": "fast",
    "specific": "Femea"
  },
  {
    "from": "Burmy",
    "to": "Wormadam (ground)",
    "kinds": [
      "time"
    ],
    "time": "fast",
    "specific": "Femea"
  },
  {
    "from": "Burmy",
    "to": "Mothim",
    "kinds": [
      "time"
    ],
    "time": "fast",
    "specific": "Macho"
  },
  {
    "from": "combee",
    "to": "Vespiquen",
    "kinds": [
      "time"
    ],
    "time": "slow",
    "specific": "Femea"
  },
  {
    "from": "buizel",
    "to": "Floatzel",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "cherubi",
    "to": "Cherrim",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "shellos",
    "to": "Gastrodon",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "drifloon",
    "to": "Drifblim",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "buneary",
    "to": "Lopunny",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 4
  },
  {
    "from": "glameow",
    "to": "Purgugly",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "chingling",
    "to": "Chimecho",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 4
  },
  {
    "from": "stunk",
    "to": "Skuntank",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "bronzor",
    "to": "Bronzong",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "bonsly",
    "to": "Sudowoodo",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "mime jf",
    "to": "Mr. Mime",
    "kinds": [
      "specific"
    ],
    "specific": "usar mimic"
  },
  {
    "from": "happiny",
    "to": "Chansey",
    "kinds": [
      "item"
    ],
    "items": [
      "oval stone"
    ]
  },
  {
    "from": "gible",
    "to": "Gabite",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "gabite",
    "to": "Garchomp",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "munchlax",
    "to": "Snorlax",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 4
  },
  {
    "from": "riolu",
    "to": "Lucario",
    "kinds": [
      "happiness_loyalty"
    ],
    "loyalty": 5
  },
  {
    "from": "hippopotas",
    "to": "Hippowdon",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "skorupi",
    "to": "Drapion",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "croagunk",
    "to": "Toxicroak",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "finneon",
    "to": "Lumineon",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "mantyke",
    "to": "Mantine",
    "kinds": [
      "specific"
    ],
    "specific": "ser mordido por um remoraid"
  },
  {
    "from": "snover",
    "to": "Abomasnow",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Snivy",
    "to": "Servine",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Servine",
    "to": "Serperior",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "tepig",
    "to": "Pignite",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "pignite",
    "to": "Emboar",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "oshawott",
    "to": "Dewott",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "dewott",
    "to": "Samurott",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "patrat",
    "to": "Watchog",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "lillipup",
    "to": "Herdier",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Herdier",
    "to": "Stoutland",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "purrloin",
    "to": "Liepard",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "pansage",
    "to": "Simisage",
    "kinds": [
      "item"
    ],
    "items": [
      "leaf stone"
    ]
  },
  {
    "from": "pansear",
    "to": "Simisear",
    "kinds": [
      "item"
    ],
    "items": [
      "fire stone"
    ]
  },
  {
    "from": "panpour",
    "to": "Simipour",
    "kinds": [
      "item"
    ],
    "items": [
      "water stone"
    ]
  },
  {
    "from": "munna",
    "to": "Musharna",
    "kinds": [
      "item"
    ],
    "items": [
      "moon stone"
    ]
  },
  {
    "from": "pidove",
    "to": "Tranquil",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "tranquil",
    "to": "Unfezant",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "blitzle",
    "to": "Zebstrika",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "roggenrola",
    "to": "Boldore",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "boldore",
    "to": "Gigalith",
    "kinds": [
      "trade"
    ]
  },
  {
    "from": "woobat",
    "to": "Swoobat",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 4
  },
  {
    "from": "drillbur",
    "to": "Excadrill",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "timburr",
    "to": "Gurdurr",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "gurdurr",
    "to": "Conkeldurr",
    "kinds": [
      "trade"
    ]
  },
  {
    "from": "tympole",
    "to": "Palpitoad",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "palpitoad",
    "to": "Seismitoad",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "swaddle",
    "to": "Swadloon",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "swadloon",
    "to": "Leavanny",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 4
  },
  {
    "from": "venipede",
    "to": "Whirlpede",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "whirlpede",
    "to": "Scolipede",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "cottonee",
    "to": "Whimsicott",
    "kinds": [
      "item"
    ],
    "items": [
      "sun stone"
    ]
  },
  {
    "from": "petilil",
    "to": "Liligant",
    "kinds": [
      "item"
    ],
    "items": [
      "sun stone"
    ]
  },
  {
    "from": "sandile",
    "to": "Krokorok",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "krokorok",
    "to": "Krookodile",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "darumaka",
    "to": "Darmanitan",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "darumaka",
    "to": "Darmanitan Zen mode",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "dwebble",
    "to": "Crustle",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "scraggy",
    "to": "Scrafty",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "yamask",
    "to": "Cofagrigus",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "tirtouga",
    "to": "Carracosta",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "archen",
    "to": "Archeops",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "trubbish",
    "to": "Garbodor",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "zorua",
    "to": "Zoroark",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "minccino",
    "to": "Cinccino",
    "kinds": [
      "item"
    ],
    "items": [
      "shine stone"
    ]
  },
  {
    "from": "gothita",
    "to": "Gothorita",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "gothorita",
    "to": "Gothitelle",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "solosis",
    "to": "Duosion",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "duosion",
    "to": "Reuniclus",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "ducklett",
    "to": "Swanna",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "vanilite",
    "to": "Vanillish",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "vanilish",
    "to": "Vanilluxe",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "deerling",
    "to": "Sawsbuck",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "karrablast",
    "to": "Escavalier",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "foongus",
    "to": "Amoonguss",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "frillish",
    "to": "Jellicent",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "joltik",
    "to": "Galvantula",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "ferroseed",
    "to": "Ferrothorn",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "klink",
    "to": "Klang",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "klank",
    "to": "Klinklang",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "tynamo",
    "to": "Eelektrik",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "eelektrik",
    "to": "Eelektross",
    "kinds": [
      "item"
    ],
    "items": [
      "thunder stone"
    ]
  },
  {
    "from": "elgyem",
    "to": "Beheeyem",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "litwick",
    "to": "Lampent",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "lampert",
    "to": "Chandelure",
    "kinds": [
      "item"
    ],
    "items": [
      "dusk stone"
    ]
  },
  {
    "from": "axew",
    "to": "Fraxure",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "fraxure",
    "to": "Haxorus",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "cubchoo",
    "to": "Beartic",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "shelmet",
    "to": "Accelgor",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "mienfoo",
    "to": "Mienshao",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "golett",
    "to": "Golurk",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "pawniard",
    "to": "Bisharp",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "rufflet",
    "to": "Braviary",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "vullaby",
    "to": "Mandibuzz",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "deino",
    "to": "Zweilous",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "zweilous",
    "to": "Hydreigon",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "larvesta",
    "to": "Volcarona",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "chespin",
    "to": "Quilladin",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "quiladin",
    "to": "Chesnaught",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "fennekin",
    "to": "Braixen",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "Braixen",
    "to": "Delphox",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "froakie",
    "to": "Frogadier",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "frogadier",
    "to": "Greninja",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "bunnelby",
    "to": "Diggersby",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "fletchling",
    "to": "Fletchinder",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "fletchinder",
    "to": "Talonflame",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "scatterbug",
    "to": "Spewpa",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "spewda",
    "to": "Vivillon",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "litleo",
    "to": "Pyroar",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "flabebe",
    "to": "Floette",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "floette",
    "to": "Florges",
    "kinds": [
      "item"
    ],
    "items": [
      "shine stone"
    ]
  },
  {
    "from": "skiddo",
    "to": "Gogoat",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "pancham",
    "to": "Pangoro",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "espurr",
    "to": "Meowstic",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "honedge",
    "to": "Doublade",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "doublade",
    "to": "Aegislash",
    "kinds": [
      "item"
    ],
    "items": [
      "dusk stone"
    ]
  },
  {
    "from": "spritzee",
    "to": "Aromatisse",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "sachet"
    ]
  },
  {
    "from": "swirlix",
    "to": "Slurpuff",
    "kinds": [
      "item",
      "trade"
    ],
    "items": [
      "whipped dream"
    ]
  },
  {
    "from": "inkay",
    "to": "Malamar",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "binacle",
    "to": "Barbaracle",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "skrelp",
    "to": "Dragalge",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "clauncher",
    "to": "Clawitzer",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "helioptile",
    "to": "Heliolisk",
    "kinds": [
      "item"
    ],
    "items": [
      "sun stone"
    ]
  },
  {
    "from": "tyrunt",
    "to": "Tyrantrum",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "amaura",
    "to": "Aurorus",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "goomy",
    "to": "Sliggoo",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "slinggoo",
    "to": "Goodra",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "phantump",
    "to": "Trevenant",
    "kinds": [
      "trade"
    ]
  },
  {
    "from": "pumpkaboo",
    "to": "Gourgeist",
    "kinds": [
      "trade"
    ]
  },
  {
    "from": "bergmite",
    "to": "Avalugg",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "noibat",
    "to": "Noivern",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "rowlet",
    "to": "Dartrix",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "dartrix",
    "to": "Decidueye",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "litten",
    "to": "Torracat",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "torracat",
    "to": "Incineroar",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "popplio",
    "to": "Brionne",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "brionne",
    "to": "Primarina",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "pikipek",
    "to": "Trumbeak",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "trumbeak",
    "to": "Toucannon",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "yungoos",
    "to": "Gumshoos",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "grubbin",
    "to": "Charjabug",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "charjabug",
    "to": "Vikavolt",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "crabrawler",
    "to": "Crabominable",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "cutielfy",
    "to": "Ribombee",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "rockruff",
    "to": "lycanroc",
    "kinds": [
      "time"
    ],
    "time": "medium",
    "specific": "day"
  },
  {
    "from": "rockruff",
    "to": "lycanroc",
    "kinds": [
      "time"
    ],
    "time": "medium",
    "specific": "dawn"
  },
  {
    "from": "rockruff",
    "to": "lycanroc",
    "kinds": [
      "time"
    ],
    "time": "medium",
    "specific": "night"
  },
  {
    "from": "mareanie",
    "to": "Toxapex",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "mudbray",
    "to": "Mudsdale",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "dewpider",
    "to": "Araquanid",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "fomantis",
    "to": "Lurantis",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "morelull",
    "to": "Shiinotic",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "salandit",
    "to": "Salazzle",
    "kinds": [
      "time"
    ],
    "time": "medium",
    "specific": "Femea"
  },
  {
    "from": "stufful",
    "to": "Bewear",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "bounswet",
    "to": "Steenee",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "steenee",
    "to": "Tsareena",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "wimpod",
    "to": "Golisopod",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "sandygast",
    "to": "Palossand",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "type:null",
    "to": "Silvally",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "jangmo-o",
    "to": "Hakamo-o",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "hakamo-o",
    "to": "Kommo-o",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "cosmog",
    "to": "cosmoem",
    "kinds": [
      "time"
    ]
  },
  {
    "from": "cosmoem",
    "to": "solgaleo",
    "kinds": [
      "time"
    ]
  },
  {
    "from": "cosmoem",
    "to": "lunala",
    "kinds": [
      "time"
    ]
  },
  {
    "from": "meltan",
    "to": "Melmetal",
    "kinds": [
      "time"
    ]
  },
  {
    "from": "ub-adhesive",
    "to": "UB- Stinger",
    "kinds": [
      "time"
    ]
  },
  {
    "from": "grookey",
    "to": "Thwakey",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "thwakey",
    "to": "Rillaboom",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "scorbunny",
    "to": "Raboot",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "raboot",
    "to": "Cinderace",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "sobble",
    "to": "Drizzile",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "drizzile",
    "to": "Inteleon",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "skwovet",
    "to": "Greedent",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "rookidee",
    "to": "Rookidee",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "corvisquire",
    "to": "Corviknight",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "blipbug",
    "to": "Dottler",
    "kinds": [
      "time"
    ],
    "time": "fast"
  },
  {
    "from": "dottler",
    "to": "Orbeetle",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "nickit",
    "to": "Thievul",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "gossifleur",
    "to": "Eldegoss",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "wooloo",
    "to": "Dubwool",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "chewtle",
    "to": "Drednaw",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "yamper",
    "to": "Boltund",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "rolycoly",
    "to": "Carkol",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "carkol",
    "to": "Coalossal",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "applin",
    "to": "flapple",
    "kinds": [
      "item"
    ],
    "items": [
      "tart apple"
    ]
  },
  {
    "from": "applin",
    "to": "appletun",
    "kinds": [
      "item"
    ],
    "items": [
      "sweet apple"
    ]
  },
  {
    "from": "silicobra",
    "to": "Sandaconda",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "arrokuda",
    "to": "Barraskewda",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "toxel",
    "to": "Toxtricity",
    "kinds": [
      "time"
    ],
    "time": "slow",
    "specific": "extrovert nature"
  },
  {
    "from": "toxel",
    "to": "Toxtricity",
    "kinds": [
      "time"
    ],
    "time": "medium",
    "specific": "introvert nature"
  },
  {
    "from": "sizzlipede",
    "to": "Centiskorch",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "clobbopus",
    "to": "Grapploct",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "sinistea",
    "to": "Polteageist",
    "kinds": [
      "time",
      "item"
    ],
    "time": "medium",
    "items": [
      "cracked pot"
    ]
  },
  {
    "from": "hatenna",
    "to": "Hattrem",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "hattrem",
    "to": "Hatterene",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "impidimp",
    "to": "Morgrem",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "morgrem",
    "to": "Grimmsnarl",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "zigzagoon galar",
    "to": "linoone galar",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "linoone galar",
    "to": "Obstagoon",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "meowth falar",
    "to": "Perrserker",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "corsola galar",
    "to": "Cursola",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "farfetch'd galar",
    "to": "Sirfetch’d",
    "kinds": [
      "specific"
    ],
    "specific": "acertar 3 criticos em 1 batalha"
  },
  {
    "from": "mr. mime galar",
    "to": "Mr. Rime",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "darumaka galar",
    "to": "Darmanitan galar",
    "kinds": [
      "item"
    ],
    "items": [
      "ice stone"
    ]
  },
  {
    "from": "darumaka galar",
    "to": "Darmanitan galar zen mode",
    "kinds": [
      "item"
    ],
    "items": [
      "ice stone"
    ]
  },
  {
    "from": "yamask galar",
    "to": "Runerigus",
    "kinds": [
      "specific"
    ],
    "specific": "passar perto de pinturas de ruinas"
  },
  {
    "from": "milcery",
    "to": "Alcremie",
    "kinds": [
      "specific"
    ],
    "specific": "rodar enquanto segura uma berry"
  },
  {
    "from": "ponyta galar",
    "to": "Rapidash galar",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "snom",
    "to": "Frosmoth",
    "kinds": [
      "happiness_loyalty"
    ],
    "happiness": 5
  },
  {
    "from": "cufant",
    "to": "Copperajah",
    "kinds": [
      "time"
    ],
    "time": "medium"
  },
  {
    "from": "dreepy",
    "to": "Drakloak",
    "kinds": [
      "time"
    ],
    "time": "slow"
  },
  {
    "from": "drakloak",
    "to": "Dragapult",
    "kinds": [
      "time"
    ],
    "time": "slow"
  }
];
