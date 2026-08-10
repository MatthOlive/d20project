import type { Rank } from "@/lib/pokerole";

type AttributeMap = Record<string, number>;

type SpeciesBalance = {
  base_hp?: number;
  base_attrs?: AttributeMap;
  suggested_rank?: Rank;
};

// Conservative corrections for imported Paldea/Hisui evolutions whose original
// conversion did not produce meaningful growth over their previous form.
const PALDEA_HISUI_SPECIES_BALANCE: Record<string, SpeciesBalance> = {
  Annihilape: { base_attrs: { strength: 4, dexterity: 3, vitality: 2, special: 2, insight: 2 } },
  Basculegion: { base_attrs: { strength: 2, dexterity: 2, vitality: 2, special: 4, insight: 2 } },
  Baxcalibur: {
    base_attrs: { strength: 4, dexterity: 2, vitality: 3, special: 2, insight: 2 },
  },
  "Decidueye (Hisuian Form)": { base_hp: 5, suggested_rank: "ace" },
  Floragato: { base_attrs: { strength: 3, dexterity: 2, vitality: 2, special: 2, insight: 2 } },
  Kingambit: { base_attrs: { strength: 4, dexterity: 2, vitality: 3, special: 2, insight: 2 } },
  Kleavor: { base_attrs: { strength: 4, dexterity: 2, vitality: 3, special: 2, insight: 2 } },
  Meowscarada: {
    base_hp: 5,
    base_attrs: { strength: 3, dexterity: 4, vitality: 2, special: 2, insight: 2 },
    suggested_rank: "ace",
  },
  Quaquaval: {
    base_hp: 5,
    base_attrs: { strength: 4, dexterity: 3, vitality: 2, special: 2, insight: 2 },
    suggested_rank: "ace",
  },
  Quaxwell: { base_attrs: { strength: 3, dexterity: 2, vitality: 2, special: 2, insight: 2 } },
  "Samurott (Hisuian Form)": { base_hp: 5, suggested_rank: "ace" },
  Skeledirge: { suggested_rank: "ace" },
  Sneasler: { base_attrs: { strength: 4, dexterity: 3, vitality: 2, special: 1, insight: 2 } },
  "Typhlosion (Hisuian Form)": { base_hp: 5, suggested_rank: "ace" },
};

export function applyPaldeaHisuiSpeciesBalance<
  T extends {
    name: string;
    base_hp: number;
    base_attrs: AttributeMap;
    attr_limits: AttributeMap;
    suggested_rank?: Rank | null;
  },
>(species: T): T {
  const balance = PALDEA_HISUI_SPECIES_BALANCE[species.name];
  if (!balance) return species;

  const baseAttrs = balance.base_attrs
    ? { ...species.base_attrs, ...balance.base_attrs }
    : species.base_attrs;
  const attrLimits = { ...species.attr_limits };
  for (const [attribute, baseValue] of Object.entries(baseAttrs)) {
    attrLimits[attribute] = Math.max(attrLimits[attribute] ?? baseValue, baseValue);
  }

  return {
    ...species,
    ...balance,
    base_attrs: baseAttrs,
    attr_limits: attrLimits,
  };
}
