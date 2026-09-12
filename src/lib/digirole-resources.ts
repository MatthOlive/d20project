import { digiRoleTamerHpMax, digiRoleDigimonHpMax, digiRoleTamerDsMax, digiRoleDigimonDsMax, type DigiRoleNumbers } from "./digirole";

type ResourceSheet = {
  attrs: DigiRoleNumbers;
  attr_points?: DigiRoleNumbers;
  bonuses?: DigiRoleNumbers;
  rank?: string;
  hp_current: number;
  ds_current: number;
  condensed_count?: number;
  stabilized_forms?: number;
  species?: { hp_base: number } | null;
};

export function digiRoleSheetResources(kind: "digirole_tamer" | "digirole_digimon", sheet: ResourceSheet, hybrid?: { base_attrs: DigiRoleNumbers; hp_base: number } | null) {
  const base = hybrid?.base_attrs ?? sheet.attrs;
  const total = (key: string) => (base[key] ?? 0) + (sheet.attr_points?.[key] ?? 0) + (sheet.bonuses?.[key] ?? 0);
  const attrs = { vitality: total("vitality"), spirit: total("spirit") };
  const rank = sheet.rank ?? "In-Training I";
  const hpMax = (kind === "digirole_tamer" && !hybrid
    ? digiRoleTamerHpMax(attrs, rank)
    : digiRoleDigimonHpMax(hybrid?.hp_base ?? sheet.species?.hp_base ?? 3, attrs, rank)) + (sheet.bonuses?.hp ?? 0);
  const dsMax = (kind === "digirole_tamer"
    ? digiRoleTamerDsMax(attrs, sheet.condensed_count ?? 0, rank)
    : digiRoleDigimonDsMax(attrs, sheet.stabilized_forms ?? 1, rank)) + (sheet.bonuses?.ds ?? 0);
  return { hp: { current: sheet.hp_current, max: hpMax }, ds: { current: sheet.ds_current, max: dsMax } };
}
