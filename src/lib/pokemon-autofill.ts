import { supabase } from "@/integrations/supabase/client";
import { POKEMON_ATTRS, SOCIAL_ATTRS, RANKS, type Rank } from "@/lib/pokerole";

const SKILL_NAMES = [
  "Brawl","Channel","Clash","Evasion","Alert","Athletic","Nature","Stealth","Allure","Etiquette","Intimidate","Perform",
];

const physPool: Record<Rank, number> = { starter: 0, beginner: 2, amateur: 4, ace: 6, pro: 8, master: 10 };
const skillPool: Record<Rank, number> = { starter: 5, beginner: 9, amateur: 12, ace: 14, pro: 15, master: 16 };
const skillCapByRank: Record<Rank, number> = { starter: 1, beginner: 2, amateur: 3, ace: 4, pro: 5, master: 5 };

export type AutofillResult = {
  patch: Record<string, unknown>;
  moveIds: string[];
};

/**
 * Computes the autofill payload (attrs, skills, sex, nature, ability, moves) for a
 * given species + rank. Use it both when generating a random Pokémon and when the
 * user clicks "Preencher automaticamente" in an existing sheet.
 */
export async function rollPokemonAutofill(
  speciesId: string,
  rank: Rank,
  opts: { overgrown?: boolean } = {},
): Promise<AutofillResult> {
  const [spRes, natRes, mvRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("species") as any).select("base_attrs,attr_limits,base_hp,abilities").eq("id", speciesId).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("natures") as any).select("name,confidence"),
    supabase.from("species_moves").select("min_rank,move_id").eq("species_id", speciesId),
  ]);
  const sp = (spRes.data ?? {}) as { base_attrs: Record<string, number>; attr_limits: Record<string, number>; base_hp: number; abilities: string[] };
  const natures = (natRes.data ?? []) as { name: string; confidence: number }[];
  const learnable = (mvRes.data ?? []) as { min_rank: Rank; move_id: string }[];

  const skillCap = skillCapByRank[rank];

  const attrPoints: Record<string, number> = {};
  for (const a of POKEMON_ATTRS) attrPoints[a] = 0;
  const curAttrs: Record<string, number> = { ...sp.base_attrs };
  let physRemaining = physPool[rank];
  const eligiblePhys = () => POKEMON_ATTRS.filter((a) => (curAttrs[a] ?? sp.base_attrs[a] ?? 1) < (sp.attr_limits[a] ?? 5));
  while (physRemaining > 0) {
    const opts2 = eligiblePhys();
    if (opts2.length === 0) break;
    const pick = opts2[Math.floor(Math.random() * opts2.length)];
    attrPoints[pick] = (attrPoints[pick] ?? 0) + 1;
    curAttrs[pick] = (curAttrs[pick] ?? sp.base_attrs[pick] ?? 1) + 1;
    physRemaining--;
  }
  const socialAttrs: Record<string, number> = {};
  const socialPoints: Record<string, number> = {};
  for (const a of SOCIAL_ATTRS) { socialAttrs[a] = 1; socialPoints[a] = 0; }
  let socRemaining = physPool[rank];
  const eligibleSoc = () => SOCIAL_ATTRS.filter((a) => (socialAttrs[a] + socialPoints[a]) < 5);
  while (socRemaining > 0) {
    const opts2 = eligibleSoc();
    if (opts2.length === 0) break;
    const pick = opts2[Math.floor(Math.random() * opts2.length)];
    socialPoints[pick]++;
    socRemaining--;
  }
  const skills: Record<string, number> = {};
  for (const s of SKILL_NAMES) skills[s] = 0;
  let skRemaining = skillPool[rank];
  const eligibleSkill = () => SKILL_NAMES.filter((s) => skills[s] < skillCap);
  while (skRemaining > 0) {
    const opts2 = eligibleSkill();
    if (opts2.length === 0) break;
    const pick = opts2[Math.floor(Math.random() * opts2.length)];
    skills[pick]++;
    skRemaining--;
  }
  const sex = ["male", "female", "none"][Math.floor(Math.random() * 3)];
  const nat = natures.length > 0 ? natures[Math.floor(Math.random() * natures.length)] : null;
  const abilities = sp.abilities ?? [];
  const selectedAbility = abilities.length > 0 ? abilities[Math.floor(Math.random() * abilities.length)] : null;
  const modifiers: Record<string, unknown> = {};
  if (selectedAbility) modifiers._selected_ability = selectedAbility;
  const baseHp = (sp.base_hp ?? 0) + (opts.overgrown ? 1 : 0);
  const vit = curAttrs.vitality ?? 1;
  const ins = curAttrs.insight ?? 1;

  const rankOrder = RANKS.indexOf(rank);
  const allowedMoves = learnable
    .filter((l) => RANKS.indexOf(l.min_rank) <= rankOrder)
    .map((l) => l.move_id);
  const moveCap = ins + 2;
  const moveIds = [...allowedMoves].sort(() => Math.random() - 0.5).slice(0, moveCap);

  return {
    patch: {
      rank,
      current_attrs: curAttrs,
      attr_points: attrPoints,
      social_attrs: socialAttrs,
      social_attr_points: socialPoints,
      skills,
      modifiers,
      sex,
      nature: nat?.name ?? null,
      confidence: nat?.confidence ?? 0,
      hp: baseHp + vit,
      will: ins + 2,
    },
    moveIds,
  };
}

/**
 * Apply the autofill to an existing Pokémon row: patches the row and replaces the move list.
 */
export async function applyAutofillToPokemon(pokemonId: string, speciesId: string, rank: Rank) {
  const { patch, moveIds } = await rollPokemonAutofill(speciesId, rank);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("pokemon") as any).update(patch).eq("id", pokemonId);
  if (error) throw error;
  await supabase.from("pokemon_moves").delete().eq("pokemon_id", pokemonId);
  if (moveIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("pokemon_moves") as any).insert(
      moveIds.map((mid) => ({ pokemon_id: pokemonId, move_id: mid })),
    );
  }
}
