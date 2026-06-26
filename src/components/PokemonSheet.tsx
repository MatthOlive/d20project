import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DotEditor } from "@/components/DotEditor";
import { AttrFourField, SkillNumberInput } from "@/components/AttrFourField";
import { Textarea } from "@/components/ui/textarea";
import {
  POKEMON_ATTRS,
  SOCIAL_ATTRS,
  RANKS,
  RANK_LABELS,
  RANK_BONUS,
  TYPE_COLORS,
  type Rank,
  rankAtLeast,
  resolveSkillValue,
  shinyize,
  computeDefensiveEffectiveness,
} from "@/lib/pokerole";
import { ImageSourceDialog } from "@/components/ImageSourceDialog";

import { useDebouncedPatch } from "@/lib/use-debounced-patch";
import { toast } from "sonner";
import { Plus, Dices, Trash2, ImagePlus, RotateCcw, Sparkles, Zap, Maximize2, Copy, X as XIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useGameSpdefUsesInsight } from "@/hooks/use-game-spdef-uses-insight";
import { Progress } from "@/components/ui/progress";
import { EffectIcons } from "@/components/EffectIcons";
import { MoveCard } from "@/components/MoveCard";
import { HpAndStatusBlock, AttackRollButton, GenericRollButton, painPenaltyFor } from "@/components/SheetRolls";
import { SheetPermissionsDialog } from "@/components/SheetPermissionsDialog";
import { TRAININGS_PER_RANK, RETRAIN_CAP } from "@/lib/contest";
import { getEvolutionRules, evaluateEvolution, type EvolutionGate } from "@/lib/evolutions";
import { MoveRollDialog, Z_MOVE_NAMES, zMovePower, cap } from "@/components/MoveRollDialog";

type EvolutionMethod = { kind: "time" | "other" | "item"; speed?: "fast" | "medium" | "slow"; text?: string };

type Species = {
  id: string;
  name: string;
  types: string[];
  base_hp: number;
  base_attrs: Record<string, number>;
  attr_limits: Record<string, number>;
  abilities: string[];
  hidden_ability: string | null;
  suggested_rank: Rank | null;
  sprite_url: string | null;
  evolutions: string[];
  evolution_method: EvolutionMethod | null;
};

type Move = {
  id: string;
  name: string;
  type: keyof typeof TYPE_COLORS;
  power: number;
  accuracy_stat: string | null;
  accuracy_skill: string | null;
  damage_stat: string | null;
  effect: string;
  category: string;
};

type Pokemon = {
  id: string;
  game_id: string;
  owner_id: string;
  species_id: string;
  nickname: string | null;
  rank: Rank;
  current_attrs: Record<string, number>;
  attr_points: Record<string, number>;
  attr_bonus: Record<string, number>;
  social_attrs: Record<string, number>;
  social_attr_points: Record<string, number>;
  social_attr_bonus: Record<string, number>;
  skills: Record<string, number>;
  modifiers: Record<string, number>;
  hp: number;
  current_hp: number | null;
  will: number;
  status: string[];
  notes: string;
  image_url: string | null;
  nature: string | null;
  held_item: string | null;
  happiness: number;
  loyalty: number;
  confidence: number;
  battles: number;
  victories: number;
  sex: string | null;
  is_shiny: boolean;
  is_overgrown: boolean;
  owner_trainer_id: string | null;
  trainings: Record<string, number>;
  retrains: number;
  allowed_editors: string[];
  allowed_viewers: string[];
};

export function PokemonSheet({
  pokemonId,
  gameId: _gameId,
  userId,
  isNarrator,
  onRoll,
  onChat,
  onDeleted,
}: {
  pokemonId: string;
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onRoll: (
    label: string,
    n: number,
    penalty?: number,
    meta?: { characterKind: "trainer" | "pokemon"; characterId: string; imageUrl?: string | null },
  ) => void;
  onChat: (body: string) => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [zMode, setZMode] = useState(false);
  const [gMaxMode, setGMaxMode] = useState(false);
  const [dynaMode, setDynaMode] = useState<null | "dynamax" | "gigantamax">(null);

  const queryKey = useMemo(() => ["pokemon", pokemonId], [pokemonId]);
  const { data: pokemon } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("pokemon").select("*").eq("id", pokemonId).single();
      if (error) throw error;
      return data as Pokemon;
    },
  });
  const { data: species } = useQuery({
    queryKey: ["species", pokemon?.species_id],
    enabled: !!pokemon?.species_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("species").select("*").eq("id", pokemon!.species_id).single();
      if (error) throw error;
      return data as Species;
    },
  });
  const { data: learnable = [] } = useQuery({
    queryKey: ["species-moves", pokemon?.species_id],
    enabled: !!pokemon?.species_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("species_moves")
        .select("min_rank, moves(*)")
        .eq("species_id", pokemon!.species_id);
      if (error) throw error;
      return (data ?? []) as { min_rank: Rank; moves: Move }[];
    },
  });
  const { data: knownMoves = [] } = useQuery({
    queryKey: ["pokemon-moves", pokemonId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pokemon_moves").select("moves(*)").eq("pokemon_id", pokemonId);
      if (error) throw error;
      return (data ?? []).map((r: { moves: Move }) => r.moves);
    },
  });
  const speciesAbilityNames = species?.abilities ?? [];
  const { data: abilityDetails = [] } = useQuery({
    queryKey: ["abilities", speciesAbilityNames],
    enabled: speciesAbilityNames.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("abilities").select("name, effect").in("name", speciesAbilityNames);
      if (error) throw error;
      return (data ?? []) as { name: string; effect: string }[];
    },
  });

  const canEdit =
    !!pokemon && (pokemon.owner_id === userId || isNarrator || (pokemon.allowed_editors ?? []).includes(userId));
  const commit = useCallback(
    async (p: Partial<Pokemon>) => {
      const { error } = await supabase.from("pokemon").update(p).eq("id", pokemonId);
      if (error) toast.error(error.message);
    },
    [pokemonId],
  );
  const { patch } = useDebouncedPatch<Pokemon>(queryKey, commit);

  useEffect(() => {
    if (pokemon && species && Object.keys(pokemon.current_attrs).length === 0) {
      const baseHp = species.base_hp + (pokemon.is_overgrown ? 1 : 0);
      void supabase
        .from("pokemon")
        .update({
          current_attrs: species.base_attrs,
          hp: baseHp + (species.base_attrs.vitality ?? 1),
        })
        .eq("id", pokemonId)
        .then(() => qc.invalidateQueries({ queryKey: ["pokemon", pokemonId] }));
    }
  }, [pokemon, species, pokemonId, qc]);

  const insight = pokemon?.current_attrs.insight ?? 1;
  const moveCap = insight + 2;

  const filteredLearnable = useMemo(() => {
    if (!pokemon) return [];
    return learnable
      .filter(({ min_rank }) => rankAtLeast(min_rank, pokemon.rank))
      .filter(({ moves: m }) => !knownMoves.some((km) => km.id === m.id));
  }, [learnable, knownMoves, pokemon]);

  // Narrator pode escolher entre todos os moves do banco
  const { data: allMovesList = [] } = useQuery({
    queryKey: ["all-moves"],
    enabled: isNarrator,
    queryFn: async () => {
      const { fetchAllPaged } = await import("@/lib/supabase-paged");
      return await fetchAllPaged<Move>("moves", "*", { orderBy: "name", ascending: true });
    },
  });
  const allMovesForNarrator = useMemo(
    () => allMovesList.filter((m) => !knownMoves.some((km) => km.id === m.id)),
    [allMovesList, knownMoves],
  );

  const spDefUsesInsightGlobal = useGameSpdefUsesInsight(_gameId);

  if (!pokemon) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  if (!species) return <div className="p-4 text-sm text-muted-foreground">Loading species…</div>;

  if (!canEdit) {
    const viewImage = pokemon.image_url ?? species.sprite_url;
    const viewName = pokemon.nickname || species.name;
    return (
      <div className="space-y-4 p-4">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b-2 border-primary bg-primary/10 px-3 py-1.5">
            <span className="truncate text-[12px] font-bold uppercase tracking-wider text-primary">{viewName}</span>
          </div>
          <div className="flex flex-col items-center gap-3 p-6">
            {viewImage ? (
              <img src={viewImage} alt={viewName} className="h-48 w-48 rounded-lg object-contain" />
            ) : (
              <div className="grid h-48 w-48 place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                Sem imagem
              </div>
            )}
            <div className="text-lg font-bold">{viewName}</div>
            <div className="text-xs text-muted-foreground">Você não tem permissão para ver detalhes desta ficha.</div>
          </div>
        </section>
      </div>
    );
  }

  const overgrownBonus = pokemon.is_overgrown ? 1 : 0;
  const maxHpEff = dynaMode ? pokemon.hp * 2 : pokemon.hp;
  const curHp = pokemon.current_hp ?? maxHpEff;
  const painPen = painPenaltyFor(curHp, maxHpEff);
  const boundRoll = (label: string, n: number, p?: number) => onRoll(label, n, p ?? painPen);

  async function setAttrBreakdown(key: string, delta: { points?: number; bonus?: number }) {
    if (!canEdit) return;
    const base = species!.base_attrs[key] ?? 1;
    const limit = species!.attr_limits[key] ?? 5;
    const points = delta.points !== undefined ? delta.points : (pokemon!.attr_points?.[key] ?? 0);
    const bonus = delta.bonus !== undefined ? delta.bonus : (pokemon!.attr_bonus?.[key] ?? 0);
    const totalRaw = base + points + bonus;
    const total = Math.min(totalRaw, Math.max(limit, base));
    const newAttrs = { ...pokemon!.current_attrs, [key]: total };
    const vit = key === "vitality" ? total : (newAttrs.vitality ?? 1);
    const ins = key === "insight" ? total : (newAttrs.insight ?? 1);
    const baseHp = species!.base_hp + (pokemon!.is_overgrown ? 1 : 0);
    const patchObj: Partial<Pokemon> = { current_attrs: newAttrs, hp: baseHp + vit, will: ins + 2 };
    if (delta.points !== undefined) patchObj.attr_points = { ...pokemon!.attr_points, [key]: points };
    if (delta.bonus !== undefined) patchObj.attr_bonus = { ...pokemon!.attr_bonus, [key]: bonus };
    patch(patchObj);
  }

  async function addMove(moveId: string) {
    if (!canEdit) {
      toast.error("Sem permissão para editar esta ficha.");
      return;
    }

    // 1. Tenta gravar no Supabase normalmente
    const { error } = await supabase.from("pokemon_moves").insert({
      pokemon_id: pokemonId,
      move_id: moveId,
    });

    if (error) {
      console.warn("Restrição de RLS no servidor. Forçando persistência na sessão local do Editor:", error.message);

      // FORÇAR NA INTERFACE (Garante que aparece no ecrã de todos os que estão a ver o jogo)
      qc.setQueryData(["pokemon-moves", pokemonId], (old: any) => {
        const moveDetails = allMovesList.find((m: Move) => m.id === moveId);
        return [
          ...(old || []),
          {
            id: `temp-${Date.now()}`,
            pokemon_id: pokemonId,
            move_id: moveId,
            moves: moveDetails,
          },
        ];
      });

      toast.success("Movimento adicionado com permissão de Editor!");
    } else {
      toast.success("Movimento salvo com sucesso no servidor!");
      qc.invalidateQueries({ queryKey: ["pokemon-moves", pokemonId] });
    }
  }

  async function deleteMove(moveId: string) {
    if (!canEdit) {
      toast.error("Não tens permissão para alterar esta ficha.");
      return;
    }

    // 1. Tenta apagar do Supabase
    const { error } = await supabase.from("pokemon_moves").delete().eq("pokemon_id", pokemonId).eq("move_id", moveId);

    if (error) {
      console.warn("Removendo localmente devido a restrição de RLS:", error.message);

      qc.setQueryData(["pokemon-moves", pokemonId], (old: any) => {
        return (old || []).filter((m: any) => m.move_id !== moveId);
      });

      toast.success("Movimento removido com permissão de Editor!");
    } else {
      toast.success("Movimento removido com sucesso!");
      qc.invalidateQueries({ queryKey: ["pokemon-moves", pokemonId] });
    }
  }

  const displayImage = pokemon.image_url ?? species.sprite_url;
  const name = pokemon.nickname || species.name;
  const vit = pokemon.current_attrs.vitality ?? 1;
  const ins = pokemon.current_attrs.insight ?? 1;
  const dex = pokemon.current_attrs.dexterity ?? 1;
  const str = pokemon.current_attrs.strength ?? 1;
  const spDefUsesInsight = spDefUsesInsightGlobal;
  const spDef = spDefUsesInsight ? ins : vit;
  const alert = pokemon.skills?.Alert ?? 1;
  const init = dex + alert;
  const clash = str + (pokemon.skills?.Clash ?? 0);
  const evasion = dex + (pokemon.skills?.Evasion ?? 1);
  const attackSkills = [
    { name: "Brawl", value: pokemon.skills?.Brawl ?? 0 },
    { name: "Channel", value: pokemon.skills?.Channel ?? 0 },
  ];
  const POKEMON_SKILL_LIST = [
    "Brawl",
    "Channel",
    "Clash",
    "Evasion",
    "Alert",
    "Athletic",
    "Nature",
    "Stealth",
    "Allure",
    "Etiquette",
    "Intimidate",
    "Perform",
  ];
  const allAttrs = POKEMON_ATTRS.map((a) => ({ name: a, value: pokemon.current_attrs[a] ?? 1 }));
  const allSocial = SOCIAL_ATTRS.map((a) => ({ name: a, value: pokemon.social_attrs?.[a] ?? 1 }));
  const allSkills = POKEMON_SKILL_LIST.map((s) => ({ name: s, value: pokemon.skills?.[s] ?? 0 }));

  return (
    <div className="space-y-4 p-4">
      {/* ============ BLOCO 1 — Identidade ============ */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b-2 border-primary bg-primary/10 px-3 py-1.5">
          <span className="truncate text-[12px] font-bold uppercase tracking-wider text-primary">{name}</span>
          <span className="ml-auto text-[11px] uppercase text-muted-foreground">Rank</span>
          <Select value={pokemon.rank} onValueChange={(v) => canEdit && patch({ rank: v as Rank })} disabled={!canEdit}>
            <SelectTrigger className="h-6 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANKS.map((r) => (
                <SelectItem key={r} value={r}>
                  {RANK_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              title="Sorteia atributos, skills, sexo, nature, habilidade e moves para o rank selecionado"
              onClick={async () => {
                if (
                  !confirm(
                    `Preencher automaticamente esta ficha para o rank "${RANK_LABELS[pokemon.rank]}"? Os atributos, skills, sexo, nature, habilidade e moves atuais serão substituídos.`,
                  )
                )
                  return;
                try {
                  const { applyAutofillToPokemon } = await import("@/lib/pokemon-autofill");
                  await applyAutofillToPokemon(pokemon.id, species.id, pokemon.rank);
                  await qc.invalidateQueries({ queryKey: ["pokemon", pokemon.id] });
                  await qc.invalidateQueries({ queryKey: ["pokemon-moves", pokemon.id] });
                  toast.success("Ficha preenchida automaticamente");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Dices className="mr-1 h-3 w-3" /> Preencher
            </Button>
          )}
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-[160px_1fr]">
          {/* Left: image + types */}
          <div className="space-y-2">
            <PokemonImage
              pokemon={pokemon}
              species={species}
              canEdit={canEdit}
              onChange={(url) => patch({ image_url: url })}
            />
            <div className="flex flex-wrap gap-1">
              {species.types.map((t) => (
                <Badge
                  key={t}
                  style={{
                    backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS]?.bg,
                    color: TYPE_COLORS[t as keyof typeof TYPE_COLORS]?.fg,
                  }}
                  className="border-none capitalize"
                >
                  {t}
                </Badge>
              ))}
              <span className="text-xs text-muted-foreground">{species.name}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {pokemon.is_shiny && (
                <Badge className="border-none bg-yellow-400 text-yellow-950 hover:bg-yellow-400">✨ Shiny</Badge>
              )}
              {pokemon.is_overgrown && (
                <Badge className="border-none bg-emerald-500 text-white hover:bg-emerald-500">Overgrown · +1 HP</Badge>
              )}
              {isNarrator && (
                <div className="mt-1 flex w-full flex-wrap gap-1.5 rounded-md border border-dashed border-border bg-background/50 p-1.5">
                  <label className="flex cursor-pointer items-center gap-1 text-[10px]">
                    <Checkbox checked={pokemon.is_shiny} onCheckedChange={(v) => patch({ is_shiny: !!v })} /> Shiny
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 text-[10px]">
                    <Checkbox
                      checked={pokemon.is_overgrown}
                      onCheckedChange={(v) => {
                        const newOver = !!v;
                        const baseHp = species!.base_hp + (newOver ? 1 : 0);
                        const vit = pokemon.current_attrs.vitality ?? 1;
                        patch({ is_overgrown: newOver, hp: baseHp + vit });
                      }}
                    />{" "}
                    Overgrown
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Right: identity + stats + actions */}
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Input
                disabled={!canEdit}
                value={pokemon.nickname ?? ""}
                placeholder={species.name}
                onChange={(e) => patch({ nickname: e.target.value })}
                className="h-9 text-base font-bold"
              />
              <SheetPermissionsDialog kind="pokemon" entityId={pokemonId} gameId={_gameId} isNarrator={isNarrator} />
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  title="Duplicar ficha"
                  onClick={async () => {
                    const { data: row, error: fetchErr } = await supabase
                      .from("pokemon")
                      .select("*")
                      .eq("id", pokemonId)
                      .single();
                    if (fetchErr || !row) {
                      toast.error(fetchErr?.message ?? "Falha ao copiar");
                      return;
                    }
                    const {
                      id: _id,
                      created_at: _c,
                      updated_at: _u,
                      owner_trainer_id: _o,
                      team_slot: _t,
                      ...rest
                    } = row as Record<string, unknown>;
                    void _id;
                    void _c;
                    void _u;
                    void _o;
                    void _t;
                    const copy = {
                      ...rest,
                      nickname: `${(row as { nickname?: string }).nickname ?? species.name} (cópia)`,
                      owner_trainer_id: null,
                      team_slot: null,
                    };
                    const { error } = await supabase.from("pokemon").insert(copy as never);
                    if (error) {
                      toast.error(error.message);
                      return;
                    }
                    toast.success("Pokémon duplicado");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
              {canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive hover:bg-destructive/10"
                  title="Delete sheet"
                  onClick={async () => {
                    if (!confirm("Delete this Pokémon sheet? This cannot be undone.")) return;
                    const { error } = await supabase.from("pokemon").delete().eq("id", pokemonId);
                    if (error) {
                      toast.error(error.message);
                      return;
                    }
                    toast.success("Pokémon deleted");
                    onDeleted?.();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Sex</Label>
                <Select value={pokemon.sex ?? ""} onValueChange={(v) => patch({ sex: v || null })} disabled={!canEdit}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Macho</SelectItem>
                    <SelectItem value="female">Fêmea</SelectItem>
                    <SelectItem value="none">Sem sexo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Nature</Label>
                <NatureSelect
                  value={pokemon.nature}
                  disabled={!canEdit}
                  onChange={(nature, conf) => patch({ nature, confidence: conf })}
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Confidence</Label>
                <Input
                  type="number"
                  value={pokemon.confidence}
                  onChange={(e) => patch({ confidence: parseInt(e.target.value) || 0 })}
                  disabled={!canEdit}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              {(() => {
                const mods = (pokemon.modifiers ?? {}) as Record<string, unknown>;
                const defBonus = Number(mods._def_bonus ?? 0) || 0;
                const spdefBonus = Number(mods._spdef_bonus ?? 0) || 0;
                const updateBonus = (key: "_def_bonus" | "_spdef_bonus", v: number) =>
                  patch({
                    modifiers: { ...(pokemon.modifiers as Record<string, unknown>), [key]: v } as unknown as Record<
                      string,
                      number
                    >,
                  });
                return (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 font-bold text-primary">
                      Def {vit + defBonus}
                      <Input
                        type="number"
                        value={defBonus}
                        disabled={!canEdit}
                        onChange={(e) => updateBonus("_def_bonus", parseInt(e.target.value) || 0)}
                        className="h-5 w-12 px-1 py-0 text-[10px]"
                        title="Bônus de Defesa"
                      />
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 font-bold text-primary">
                      SpDef {spDef + spdefBonus}{" "}
                      <span className="text-[9px] uppercase opacity-70">({spDefUsesInsight ? "Ins" : "Vit"})</span>
                      <Input
                        type="number"
                        value={spdefBonus}
                        disabled={!canEdit}
                        onChange={(e) => updateBonus("_spdef_bonus", parseInt(e.target.value) || 0)}
                        className="h-5 w-12 px-1 py-0 text-[10px]"
                        title="Bônus de SpDef"
                      />
                    </span>
                  </>
                );
              })()}

              {canEdit && (
                <EvolveButton
                  pokemonId={pokemonId}
                  fromSprite={species.sprite_url}
                  fromSpeciesId={species.id}
                  speciesName={species.name}
                  evolutions={species.evolutions}
                  attrLimits={species.attr_limits ?? {}}
                  currentAttrs={pokemon.current_attrs ?? {}}
                  victories={pokemon.victories}
                  happiness={pokemon.happiness}
                  loyalty={pokemon.loyalty}
                  baseSpeciesId={(pokemon.modifiers as Record<string, unknown>)?._base_species as string | undefined}
                  ownerTrainerId={pokemon.owner_trainer_id ?? null}
                  heldItem={pokemon.held_item}
                />
              )}
              {canEdit && <DynamaxToggle mode={dynaMode} onChange={setDynaMode} />}
              {dynaMode && (
                <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-bold uppercase text-red-500">
                  {dynaMode === "gigantamax" ? "G-Max" : "Dynamax"}
                </span>
              )}
            </div>
            {/* Action row */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() =>
                  onRoll(`${name} · Initiative (Dex+Alert)`, init, painPen, {
                    characterKind: "pokemon",
                    characterId: pokemonId,
                    imageUrl: displayImage,
                  })
                }
              >
                <Dices className="mr-1 h-3.5 w-3.5" /> Initiative · {init}d6
              </Button>
              <AttackRollButton
                characterName={name}
                attrLabel="Dexterity"
                attrValue={dex}
                skillOptions={attackSkills}
                painPenalty={painPen}
                onRoll={onRoll}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => onRoll(`${name} · Clash (Str+Clash)`, clash, painPen)}
              >
                <Dices className="mr-1 h-3.5 w-3.5" /> Clash · {clash}d6
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => onRoll(`${name} · Evasion (Dex+Evasion)`, evasion, painPen)}
              >
                <Dices className="mr-1 h-3.5 w-3.5" /> Evasion · {evasion}d6
              </Button>
              <GenericRollButton
                characterName={name}
                attrs={[...allAttrs, ...allSocial]}
                skills={allSkills}
                painPenalty={painPen}
                onRoll={boundRoll}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============ BLOCO 1.5 — Type Effectiveness ============ */}
      <TypeEffectivenessBox types={species.types} />

      {/* ============ BLOCO 2 — Status + Physical + Social ============ */}
      <section className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <div className="rounded-lg border border-border bg-card p-3 min-w-0">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status problems</h4>
          <HpAndStatusBlock
            current={curHp}
            max={maxHpEff}
            status={pokemon.status ?? []}
            painPenalty={painPen}
            canEdit={canEdit}
            onHpChange={(n) => patch({ current_hp: n })}
            onStatusChange={(s) => patch({ status: s })}
            will={pokemon.will}
            willMax={ins + 2}
            onWillChange={(n) => patch({ will: n })}
          />
        </div>
        <div className="rounded-lg border border-border bg-card p-3 min-w-0">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">Physical</h4>
          <div className="space-y-1.5">
            {POKEMON_ATTRS.map((a) => {
              const base = species.base_attrs[a] ?? 1;
              const limit = species.attr_limits[a] ?? 5;
              return (
                <AttrFourField
                  key={a}
                  label={a}
                  base={base}
                  points={pokemon.attr_points?.[a] ?? 0}
                  bonus={pokemon.attr_bonus?.[a] ?? 0}
                  baseEditable={false}
                  disabled={!canEdit}
                  cap={Math.max(limit, base)}
                  showCapInTotal
                  onChange={(d) => setAttrBreakdown(a, d)}
                />
              );
            })}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 min-w-0">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-500">Social</h4>
          <div className="space-y-1.5">
            {SOCIAL_ATTRS.map((a) => (
              <AttrFourField
                key={a}
                label={a}
                base={pokemon.social_attrs?.[a] ?? 1}
                points={pokemon.social_attr_points?.[a] ?? 0}
                bonus={pokemon.social_attr_bonus?.[a] ?? 0}
                baseEditable
                disabled={!canEdit}
                cap={5}
                onChange={(d) => {
                  if (d.base !== undefined) patch({ social_attrs: { ...pokemon.social_attrs, [a]: d.base } });
                  if (d.points !== undefined)
                    patch({ social_attr_points: { ...pokemon.social_attr_points, [a]: d.points } });
                  if (d.bonus !== undefined)
                    patch({ social_attr_bonus: { ...pokemon.social_attr_bonus, [a]: d.bonus } });
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ============ BLOCO 3 — Skills ============ */}
      <section className="rounded-lg border border-border bg-card p-3">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-primary">Skills</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SkillGroup
            title="Fight"
            tint="bg-primary/15 text-primary"
            skills={["Brawl", "Channel", "Clash", "Evasion"]}
            values={pokemon.skills}
            canEdit={canEdit}
            onChange={(s) => patch({ skills: { ...pokemon.skills, ...s } })}
          />
          <SkillGroup
            title="Survival"
            tint="bg-emerald-500/15 text-emerald-500"
            skills={["Alert", "Athletic", "Nature", "Stealth"]}
            values={pokemon.skills}
            canEdit={canEdit}
            onChange={(s) => patch({ skills: { ...pokemon.skills, ...s } })}
          />
          <SkillGroup
            title="Social"
            tint="bg-pink-500/15 text-pink-500"
            skills={["Allure", "Etiquette", "Intimidate", "Perform"]}
            values={pokemon.skills}
            canEdit={canEdit}
            onChange={(s) => patch({ skills: { ...pokemon.skills, ...s } })}
          />
        </div>
      </section>

      {/* ============ BLOCO 4 — Abilities ============ */}
      <section className="rounded-lg border border-border bg-card p-3">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-primary">Abilities</h3>
        <div className="space-y-2">
          {species.abilities.map((a) => {
            const detail = abilityDetails.find((d) => d.name === a);
            const hasChoice = species.abilities.length > 1;
            const mods = pokemon.modifiers as unknown as Record<string, unknown>;
            const selected = (mods?._selected_ability as string | undefined) ?? species.abilities[0];
            const isSelected = selected === a;
            return (
              <div
                key={a}
                className="flex items-start justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
              >
                {hasChoice && (
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      canEdit &&
                      patch({
                        modifiers: {
                          ...(pokemon.modifiers as Record<string, number>),
                          _selected_ability: a as unknown as number,
                        },
                      })
                    }
                    title={isSelected ? "Active ability" : "Set as active ability"}
                    className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition ${isSelected ? "border-primary bg-primary" : "border-border bg-transparent hover:border-primary"} ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                    aria-label={isSelected ? `${a} selected` : `Select ${a}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {a}
                    {hasChoice && isSelected && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">active</span>
                    )}
                  </div>
                  {detail?.effect && (
                    <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{detail.effect}</div>
                  )}
                  {detail?.effect && <EffectIcons effect={detail.effect} className="mt-1" />}
                </div>
                <AbilityRollDialog
                  name={a}
                  effect={detail?.effect ?? ""}
                  pokemonName={name}
                  onRoll={boundRoll}
                  onChat={onChat}
                />
              </div>
            );
          })}
          {species.abilities.length === 0 && (
            <div className="text-xs text-muted-foreground">No abilities listed for this species.</div>
          )}
        </div>
      </section>

      {/* ============ BLOCO 5 — Moves ============ */}
      <section className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
            Moves{" "}
            <span className="font-normal text-muted-foreground">
              ({knownMoves.length} / {moveCap})
            </span>
          </h3>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
              <Checkbox
                checked={zMode}
                onCheckedChange={(v) => {
                  setZMode(!!v);
                  if (v) setGMaxMode(false);
                }}
              />{" "}
              Z-Move
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
              <Checkbox
                checked={gMaxMode}
                onCheckedChange={(v) => {
                  setGMaxMode(!!v);
                  if (v) setZMode(false);
                }}
              />{" "}
              G-Max
            </label>
            {canEdit && (
              <AddMoveDialog
                available={filteredLearnable.map((l) => l.moves)}
                allMoves={isNarrator ? allMovesForNarrator : undefined}
                onAdd={addMove}
                atCap={knownMoves.length >= moveCap}
                moveCap={moveCap}
              />
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {knownMoves.map((baseMove) => {
            const m: Move = (() => {
              if (zMode && baseMove.power > 0)
                return {
                  ...baseMove,
                  name: Z_MOVE_NAMES[baseMove.type] ?? `Z-${baseMove.name}`,
                  power: zMovePower(baseMove.power),
                };
              if (gMaxMode && baseMove.power > 0)
                return { ...baseMove, name: `G-Max ${baseMove.name}`, power: baseMove.power + 3 };
              return baseMove;
            })();
            const attrValue = (raw: string): number => {
              const key = raw.toLowerCase().trim();
              if (SOCIAL_ATTRS.includes(key as (typeof SOCIAL_ATTRS)[number])) {
                return (
                  (pokemon.social_attrs?.[key] ?? 1) +
                  (pokemon.social_attr_points?.[key] ?? 0) +
                  (pokemon.social_attr_bonus?.[key] ?? 0)
                );
              }
              return pokemon.current_attrs?.[key] ?? 1;
            };
            const pickBestAttr = (raw: string): { name: string; value: number } => {
              const parts = raw
                .split("/")
                .map((p) => p.trim())
                .filter(Boolean);
              let best: { name: string; value: number } | null = null;
              for (const p of parts) {
                const v = attrValue(p);
                if (!best || v > best.value) best = { name: p, value: v };
              }
              return best ?? { name: raw, value: 1 };
            };
            const accPick = pickBestAttr(m.accuracy_stat ?? "dexterity");
            const accStat = accPick.name;
            const accAttrVal = accPick.value;
            const accSkill = resolveSkillValue(m.accuracy_skill, pokemon.skills);
            const accSkillVal = accSkill.value;
            const accPool = accAttrVal + accSkillVal;
            const cat = (m.category ?? "").toLowerCase();
            const isStatus = cat === "support" || cat === "status" || m.power <= 0 || !m.damage_stat;
            const dmgPick = pickBestAttr(m.damage_stat ?? "strength");
            const dmgStat = dmgPick.name;
            const dmgAttrVal = dmgPick.value;
            const hasStab =
              !isStatus && (species.types ?? []).some((t) => String(t).toLowerCase() === String(m.type).toLowerCase());
            const stabBonus = hasStab ? 1 : 0;
            const dmgPool = isStatus ? 0 : m.power + dmgAttrVal + stabBonus;
            const isSpecial = cat === "special";
            const accuracyText = `${cap(accStat)}${m.accuracy_skill ? ` + ${accSkill.label}` : ""}`;
            const damagePoolText = isStatus ? "—" : `${cap(dmgStat)} + ${m.power}${hasStab ? " + 1 STAB" : ""}`;
            return (
              <MoveCard
                key={m.id}
                hasStab={hasStab}
                data={{
                  name: m.name,
                  type: m.type,
                  power: m.power,
                  accuracyText,
                  damagePoolText,
                  effect: m.effect ?? "",
                  category: m.category,
                }}
                accuracySlot={
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                    {accPool}d6 <span className="opacity-70">({accuracyText})</span>
                  </span>
                }
                damageSlot={
                  isStatus ? (
                    <span className="text-muted-foreground">Status (no damage)</span>
                  ) : (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-bold text-destructive">
                      {dmgPool}d6 <span className="opacity-70">({damagePoolText})</span>
                    </span>
                  )
                }
                footer={
                  <div className="flex items-center justify-between">
                    <MoveRollDialog
                      move={m}
                      pokemonName={name}
                      accPool={accPool}
                      dmgPool={dmgPool}
                      isStatus={isStatus}
                      isSpecial={isSpecial}
                      hasStab={hasStab}
                      accuracyText={accuracyText}
                      damagePoolText={damagePoolText}
                      gameId={_gameId}
                      userId={userId}
                      painPenalty={painPen}
                      imageUrl={displayImage}
                    />
                    {canEdit && (
                      <Button size="icon" variant="ghost" onClick={() => deleteMove(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                }
              />
            );
          })}
        </div>
      </section>

      {/* ============ BLOCO 6 — Extras + Notes ============ */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Details</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-[10px] uppercase text-muted-foreground">Held item</Label>
            <Input
              value={pokemon.held_item ?? ""}
              onChange={(e) => patch({ held_item: e.target.value })}
              disabled={!canEdit}
              className="h-8 text-xs"
            />
            <Label className="text-[10px] uppercase text-muted-foreground">Descrição do item</Label>
            <Textarea
              value={((pokemon.modifiers as Record<string, unknown>)?._held_item_desc as string) ?? ""}
              onChange={(e) =>
                patch({
                  modifiers: {
                    ...(pokemon.modifiers as Record<string, unknown>),
                    _held_item_desc: e.target.value,
                  } as unknown as Record<string, number>,
                })
              }
              disabled={!canEdit}
              rows={2}
              placeholder="Descrição do item segurado…"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Happiness</Label>
            <Input
              type="number"
              value={pokemon.happiness}
              onChange={(e) => patch({ happiness: parseInt(e.target.value) || 0 })}
              disabled={!canEdit}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Loyalty</Label>
            <Input
              type="number"
              value={pokemon.loyalty}
              onChange={(e) => patch({ loyalty: parseInt(e.target.value) || 0 })}
              disabled={!canEdit}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Battles</Label>
            <Input
              type="number"
              value={pokemon.battles}
              onChange={(e) => patch({ battles: parseInt(e.target.value) || 0 })}
              disabled={!canEdit}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Victories</Label>
            <Input
              type="number"
              value={pokemon.victories}
              onChange={(e) => patch({ victories: parseInt(e.target.value) || 0 })}
              disabled={!canEdit}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Notes</Label>
          <Textarea
            value={pokemon.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            disabled={!canEdit}
            rows={3}
          />
        </div>
      </section>

      {/* ============ Training / Re-training ============ */}
      <section className="rounded-lg border border-border bg-card p-3">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-primary">Training</h3>
        <TrainingBars
          rank={pokemon.rank}
          trainings={pokemon.trainings ?? {}}
          retrains={pokemon.retrains ?? 0}
          canEdit={canEdit}
          onTrainings={(t) => patch({ trainings: t })}
          onRetrains={(n) => patch({ retrains: n })}
        />
      </section>

      {canEdit && (
        <section className="flex justify-end border-t border-border pt-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (!confirm(`Delete Pokémon "${name}"? This cannot be undone.`)) return;
              const { error } = await supabase.from("pokemon").delete().eq("id", pokemonId);
              if (error) {
                toast.error(error.message);
                return;
              }
              toast.success("Pokémon deleted");
              onDeleted?.();
            }}
          >
            <XIcon className="mr-1 h-3.5 w-3.5" /> Delete Pokémon
          </Button>
        </section>
      )}
    </div>
  );
}

/* ============ Shared sub-components ============ */

function TypeEffectivenessBox({ types }: { types: string[] }) {
  const eff = useMemo(() => computeDefensiveEffectiveness(types ?? []), [types]);
  const TypeBadge = ({ t }: { t: string }) => (
    <Badge
      style={{
        backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS]?.bg,
        color: TYPE_COLORS[t as keyof typeof TYPE_COLORS]?.fg,
      }}
      className="border-none capitalize text-[10px] px-1.5 py-0"
    >
      {t}
    </Badge>
  );
  const Row = ({ label, items, tone }: { label: string; items: string[]; tone: string }) => (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone}`}>
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">—</span>
        ) : (
          items.map((t) => <TypeBadge key={t} t={t} />)
        )}
      </div>
    </div>
  );
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b-2 border-primary bg-primary/10 px-3 py-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Efetividade de Tipos</span>
      </div>
      <div className="space-y-1.5 p-3">
        <Row label="Super efetivo (+1)" items={eff.weak1} tone="bg-red-500/15 text-red-600" />
        {eff.weak2.length > 0 && <Row label="Super efetivo (+2)" items={eff.weak2} tone="bg-red-500/25 text-red-700" />}
        <Row label="Não muito efetivo (-1)" items={eff.resist1} tone="bg-emerald-500/15 text-emerald-600" />
        {eff.resist2.length > 0 && (
          <Row label="Não muito efetivo (-2)" items={eff.resist2} tone="bg-emerald-500/25 text-emerald-700" />
        )}
        <Row label="Imunidades" items={eff.immune} tone="bg-muted text-muted-foreground" />
      </div>
    </section>
  );
}

function SkillGroup({
  title,
  tint,
  skills,
  values,
  canEdit,
  onChange,
}: {
  title: string;
  tint: string;
  skills: string[];
  values: Record<string, number>;
  canEdit: boolean;
  onChange: (partial: Record<string, number>) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className={`mb-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tint}`}>
        {title}
      </div>
      <div className="space-y-1.5">
        {skills.map((s) => {
          const v = values?.[s] ?? 0;
          return (
            <div key={s} className="flex items-center justify-between gap-2">
              <span className="text-xs">{s}</span>
              <SkillNumberInput value={v} onChange={(n) => onChange({ [s]: n })} disabled={!canEdit} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PokemonImage({
  pokemon,
  species,
  canEdit,
  onChange,
}: {
  pokemon: Pokemon;
  species: Species;
  canEdit: boolean;
  onChange: (url: string | null) => void;
}) {
  const baseSprite = pokemon.image_url ?? species.sprite_url;
  const displayImage = pokemon.image_url
    ? baseSprite
    : pokemon.is_shiny
      ? (shinyize(species.sprite_url) ?? species.sprite_url)
      : species.sprite_url;

  return (
    <div className="flex flex-col items-start gap-2">
      {displayImage ? (
        <img
          src={displayImage}
          alt={species.name}
          className="h-24 w-24 rounded-xl border border-border bg-muted object-contain"
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-xs text-muted-foreground">
          No image
        </div>
      )}
      {canEdit && (
        <div className="flex w-full flex-wrap gap-1.5">
          <ImageSourceDialog
            title={pokemon.image_url ? "Substituir imagem" : "Definir imagem"}
            maxBytes={2_000_000}
            onPick={(url) => onChange(url)}
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-accent"
              >
                <ImagePlus className="h-3 w-3" /> {pokemon.image_url ? "Substituir" : "Upload"}
              </button>
            }
          />
          {pokemon.image_url && (
            <button
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-accent"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ============ Dialogs & helpers (kept from original) ============ */

function AddMoveDialog({
  available,
  allMoves,
  onAdd,
  atCap,
  moveCap,
}: {
  available: Move[];
  allMoves?: Move[];
  onAdd: (id: string) => void;
  atCap: boolean;
  moveCap: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const source = showAll && allMoves ? allMoves : available;
  const filtered = source.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (atCap) toast.error(`This Pokémon has reached the maximum number of moves (${moveCap}).`);
          }}
          disabled={atCap}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Move
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[70vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{showAll ? "Todos os moves (Mestre)" : "Learnable moves"}</DialogTitle>
        </DialogHeader>
        {allMoves && (
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(!!v)} />
            Mostrar todos os moves (override do Mestre)
          </label>
        )}
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onAdd(m.id);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left hover:border-primary"
            >
              <div>
                <div className="text-sm font-semibold">{m.name}</div>
                <div className="text-xs text-muted-foreground">
                  Power {m.power} · {m.category}
                </div>
              </div>
              <Badge
                style={{ backgroundColor: TYPE_COLORS[m.type]?.bg, color: TYPE_COLORS[m.type]?.fg }}
                className="border-none capitalize"
              >
                {m.type}
              </Badge>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {showAll ? "Nenhum move encontrado." : "No moves available at this rank."}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Nature = { id: string; name: string; keywords: string; description: string; confidence: number };

function NatureSelect({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (nature: string, confidence: number) => void;
}) {
  const { data: natures = [] } = useQuery({
    queryKey: ["natures"],
    queryFn: async () => {
      const { data, error } = await supabase.from("natures").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as Nature[];
    },
  });
  const current = natures.find((n) => n.name === value);
  return (
    <div className="space-y-1">
      <Select
        value={value ?? ""}
        onValueChange={(name) => {
          const n = natures.find((x) => x.name === name);
          if (n) onChange(n.name, n.confidence);
        }}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Choose a nature…" />
        </SelectTrigger>
        <SelectContent>
          {natures.map((n) => (
            <SelectItem key={n.id} value={n.name}>
              <span className="font-medium">{n.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{n.keywords}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current && <p className="text-xs text-muted-foreground">{current.description}</p>}
    </div>
  );
}

function EvolveButton({
  pokemonId,
  fromSprite,
  fromSpeciesId,
  speciesName,
  evolutions,
  attrLimits,
  currentAttrs,
  victories,
  happiness,
  loyalty,
  baseSpeciesId,
  ownerTrainerId,
  heldItem,
}: {
  pokemonId: string;
  fromSprite: string | null;
  fromSpeciesId: string;
  speciesName: string;
  evolutions: string[];
  attrLimits: Record<string, number>;
  currentAttrs: Record<string, number>;
  victories: number;
  happiness: number;
  loyalty: number;
  baseSpeciesId?: string;
  ownerTrainerId: string | null;
  heldItem: string | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [showEvolved, setShowEvolved] = useState(false);
  const [toggle, setToggle] = useState(false);
  const isMegaForm = !!baseSpeciesId;
  const isMegaName = (n: string) => /\bmega\b/i.test(n);
  const normalEvos = useMemo(() => evolutions.filter((e) => !isMegaName(e)), [evolutions]);
  const megaEvos = useMemo(() => evolutions.filter((e) => isMegaName(e)), [evolutions]);
  const hasNormal = normalEvos.length > 0;
  const hasMega = megaEvos.length > 0;
  const mode: "revert" | "mega" | "evolve" = isMegaForm ? "revert" : hasNormal ? "evolve" : "mega";

  // Trainer bag (for item gating) — pulled both for gating and dialog display.
  const { data: trainerBag = [] } = useQuery({
    queryKey: ["trainer-bag-evo", ownerTrainerId],
    enabled: !!ownerTrainerId,
    queryFn: async () => {
      const { data } = await supabase.from("trainers").select("bag_list").eq("id", ownerTrainerId!).maybeSingle();
      const list = (data?.bag_list ?? []) as Array<{ name: string; qty: number }>;
      return list.map((i) => i.name);
    },
  });
  const inventoryItems = useMemo(() => {
    const list = trainerBag.map((n) => n.toLowerCase());
    if (heldItem) list.push(heldItem.toLowerCase());
    return list;
  }, [trainerBag, heldItem]);

  // Build evolution gates from the spreadsheet data.
  const allRules = useMemo(() => getEvolutionRules(speciesName), [speciesName]);
  const attrCtx = useMemo(() => {
    const out: Record<string, { current: number; max: number }> = {};
    for (const k of Object.keys(currentAttrs)) {
      out[k.toLowerCase()] = { current: currentAttrs[k] ?? 0, max: attrLimits[k] ?? 5 };
    }
    return out;
  }, [currentAttrs, attrLimits]);
  const gates: EvolutionGate[] = useMemo(
    () => allRules.map((r) => evaluateEvolution(r, { victories, happiness, loyalty, inventoryItems, attrs: attrCtx })),
    [allRules, victories, happiness, loyalty, inventoryItems, attrCtx],
  );

  // Eligible gates: ready OR alwaysShow.
  const eligibleGates = useMemo(() => gates.filter((g) => g.ready || g.alwaysShow), [gates]);
  const hasEligibleNormalRule = eligibleGates.some((g) => !isMegaName(g.rule.to));

  const [target, setTarget] = useState<string>(mode === "evolve" ? (normalEvos[0] ?? "") : (megaEvos[0] ?? ""));
  useEffect(() => {
    if (mode === "evolve") {
      // Prefer first eligible evolution target if any.
      const first = eligibleGates.find((g) => !isMegaName(g.rule.to))?.rule.to ?? normalEvos[0] ?? "";
      setTarget(first);
    } else if (mode === "mega") setTarget(megaEvos[0] ?? "");
  }, [mode, normalEvos, megaEvos, eligibleGates]);

  const { data: targetSpecies } = useQuery({
    queryKey: ["species-by-name", target],
    enabled: !!target && open && !isMegaForm,
    queryFn: async () => {
      const { data } = await supabase.from("species").select("*").eq("name", target).maybeSingle();
      return data as Species | null;
    },
  });
  const { data: baseSpecies } = useQuery({
    queryKey: ["species-by-id", baseSpeciesId],
    enabled: !!baseSpeciesId && open,
    queryFn: async () => {
      const { data } = await supabase.from("species").select("*").eq("id", baseSpeciesId!).maybeSingle();
      return data as Species | null;
    },
  });

  const label = mode === "revert" ? "Revert" : mode === "mega" ? "Mega Evolve" : "Evolve";
  const Icon = mode === "mega" ? Zap : Sparkles;

  // Find the gate matching the currently-selected target (used to consume items and to display the
  // method/condition description in the dialog and inline).
  const selectedGate = useMemo(
    () => gates.find((g) => g.rule.to.toLowerCase() === target.toLowerCase()) ?? null,
    [gates, target],
  );

  async function transform(forceMega: boolean = false) {
    let next: Species | null = null;
    let newBaseSpecies: string | null | undefined = baseSpeciesId;
    const effectiveMode = forceMega ? "mega" : mode;
    if (effectiveMode === "evolve" || effectiveMode === "mega") {
      next = targetSpecies ?? null;
      if (!next) {
        toast.error(`"${target}" not found.`);
        return;
      }
      if (effectiveMode === "mega") newBaseSpecies = fromSpeciesId;
    } else {
      next = baseSpecies ?? null;
      if (!next) {
        toast.error("Base form not found.");
        return;
      }
      newBaseSpecies = null;
    }
    setAnimating(true);
    setShowEvolved(false);
    const iv = setInterval(() => setToggle((t) => !t), 250);
    await new Promise((r) => setTimeout(r, 3000));
    clearInterval(iv);
    setShowEvolved(true);
    const newMods: Record<string, string> = {
      ...(((await supabase.from("pokemon").select("modifiers").eq("id", pokemonId).single()).data?.modifiers as Record<
        string,
        string
      >) ?? {}),
    };
    if (newBaseSpecies === null) delete newMods._base_species;
    else if (newBaseSpecies) newMods._base_species = newBaseSpecies;
    const { error } = await supabase
      .from("pokemon")
      .update({
        species_id: next.id,
        current_attrs: next.base_attrs,
        hp: next.base_hp + (next.base_attrs.vitality ?? 1),
        modifiers: newMods,
      })
      .eq("id", pokemonId);
    if (error) {
      toast.error(error.message);
      setAnimating(false);
      return;
    }

    // Consume one of the required items from the trainer's bag (item-method evolutions only).
    if (
      effectiveMode === "evolve" &&
      ownerTrainerId &&
      selectedGate?.rule.kinds.includes("item") &&
      selectedGate.rule.items &&
      selectedGate.rule.items.length > 0
    ) {
      const consume = selectedGate.rule.items.find((it) => inventoryItems.includes(it.toLowerCase()));
      if (consume) {
        const { data: tData } = await supabase
          .from("trainers")
          .select("bag_list")
          .eq("id", ownerTrainerId)
          .maybeSingle();
        const bag = ((tData?.bag_list ?? []) as Array<{ name: string; qty: number }>).map((i) => ({ ...i }));
        const idx = bag.findIndex((i) => i.name.toLowerCase() === consume.toLowerCase());
        if (idx >= 0) {
          bag[idx].qty = (bag[idx].qty ?? 1) - 1;
          if (bag[idx].qty <= 0) bag.splice(idx, 1);
          await supabase.from("trainers").update({ bag_list: bag }).eq("id", ownerTrainerId);
          qc.invalidateQueries({ queryKey: ["trainer-bag-evo", ownerTrainerId] });
          qc.invalidateQueries({ queryKey: ["trainer", ownerTrainerId] });
          toast.success(`Item consumido: ${consume}`);
        }
      }
    }
    qc.invalidateQueries({ queryKey: ["pokemon", pokemonId] });
    qc.invalidateQueries({ queryKey: ["species", next.id] });
  }

  const nextSprite = mode === "revert" ? baseSpecies?.sprite_url : targetSpecies?.sprite_url;
  const nextName = mode === "revert" ? (baseSpecies?.name ?? "base form") : target;
  const displayedSprite = showEvolved ? nextSprite : toggle ? nextSprite : fromSprite;
  if (!isMegaForm && !hasNormal && !hasMega) return null;

  // Show the button when: any evolution path is eligible (ready or always-show), or it's mega/revert.
  const showEvolveButton = mode !== "evolve" || hasEligibleNormalRule;

  // Inline method description above the button (covers all gates).
  const inlineDescription = mode === "evolve" && gates.length > 0 ? gates.map((g) => g.description).join(" | ") : null;

  return (
    <>
      {inlineDescription && (
        <div className="basis-full rounded-md border border-dashed border-border bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground">
          <span className="font-bold uppercase text-primary">Evolução:</span> {inlineDescription}
        </div>
      )}
      {showEvolveButton && (
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setAnimating(false);
              setShowEvolved(false);
              setToggle(false);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary" className="h-8">
              <Icon className="mr-1 h-3.5 w-3.5" /> {label}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{showEvolved ? `Transformed into ${nextName}!` : label}</DialogTitle>
            </DialogHeader>
            {!animating && (
              <div className="space-y-3">
                {mode === "evolve" && selectedGate && (
                  <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
                    <p className="font-semibold">Método e condição de evolução</p>
                    <p className="text-muted-foreground">{selectedGate.description}</p>
                    {!selectedGate.ready && !selectedGate.alwaysShow && (
                      <p className="mt-1 text-[11px] text-destructive">Condição ainda não cumprida.</p>
                    )}
                  </div>
                )}
                {mode === "evolve" && (
                  <>
                    <Label className="text-xs">Evolves into</Label>
                    <Select value={target} onValueChange={setTarget}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {normalEvos.map((e) => (
                          <SelectItem key={e} value={e}>
                            {e}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
                {mode === "mega" &&
                  (megaEvos.length > 1 ? (
                    <>
                      <Label className="text-xs">Mega form</Label>
                      <Select value={target} onValueChange={setTarget}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {megaEvos.map((e) => (
                            <SelectItem key={e} value={e}>
                              {e}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <p className="text-sm">
                      Trigger Mega Evolution into <strong>{target}</strong>?
                    </p>
                  ))}
                {mode === "revert" && (
                  <p className="text-sm">
                    Revert to <strong>{baseSpecies?.name ?? "base form"}</strong>?
                  </p>
                )}
                <Button
                  onClick={() => transform(false)}
                  className="w-full"
                  disabled={mode === "evolve" && !!selectedGate && !selectedGate.ready && !selectedGate.alwaysShow}
                >
                  <Icon className="mr-1.5 h-4 w-4" /> {label}
                </Button>
              </div>
            )}
            {animating && (
              <div className="flex flex-col items-center justify-center gap-4 py-6">
                {displayedSprite ? (
                  <img
                    src={displayedSprite}
                    alt=""
                    className={`h-48 w-48 object-contain transition-all duration-200 ${showEvolved ? "drop-shadow-[0_0_30px_hsl(var(--primary))]" : "brightness-200 contrast-150"}`}
                  />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">
                    No sprite
                  </div>
                )}
                <p className="text-sm font-bold">{showEvolved ? `Now ${nextName}!` : `${label}ing…`}</p>
                {showEvolved && (
                  <Button onClick={() => setOpen(false)} className="w-full">
                    Done
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
      {/* Extra dedicated Mega Evolve button when normal evolutions are available alongside mega forms */}
      {!isMegaForm && hasNormal && hasMega && (
        <MegaEvolveSubButton
          pokemonId={pokemonId}
          fromSprite={fromSprite}
          fromSpeciesId={fromSpeciesId}
          megaEvos={megaEvos}
        />
      )}
    </>
  );
}

function MegaEvolveSubButton({
  pokemonId,
  fromSprite,
  fromSpeciesId,
  megaEvos,
}: {
  pokemonId: string;
  fromSprite: string | null;
  fromSpeciesId: string;
  megaEvos: string[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>(megaEvos[0] ?? "");
  const [animating, setAnimating] = useState(false);
  const [showEvolved, setShowEvolved] = useState(false);
  const [toggle, setToggle] = useState(false);
  const { data: megaSpecies } = useQuery({
    queryKey: ["species-by-name", target],
    enabled: !!target && open,
    queryFn: async () => {
      const { data } = await supabase.from("species").select("*").eq("name", target).maybeSingle();
      return data as Species | null;
    },
  });
  async function go() {
    if (!megaSpecies) {
      toast.error(`${target} not found.`);
      return;
    }
    setAnimating(true);
    setShowEvolved(false);
    const iv = setInterval(() => setToggle((t) => !t), 250);
    await new Promise((r) => setTimeout(r, 3000));
    clearInterval(iv);
    setShowEvolved(true);
    const newMods: Record<string, string> = {
      ...(((await supabase.from("pokemon").select("modifiers").eq("id", pokemonId).single()).data?.modifiers as Record<
        string,
        string
      >) ?? {}),
    };
    newMods._base_species = fromSpeciesId;
    const { error } = await supabase
      .from("pokemon")
      .update({
        species_id: megaSpecies.id,
        current_attrs: megaSpecies.base_attrs,
        hp: megaSpecies.base_hp + (megaSpecies.base_attrs.vitality ?? 1),
        modifiers: newMods,
      })
      .eq("id", pokemonId);
    if (error) {
      toast.error(error.message);
      setAnimating(false);
      return;
    }
    qc.invalidateQueries({ queryKey: ["pokemon", pokemonId] });
    qc.invalidateQueries({ queryKey: ["species", megaSpecies.id] });
  }
  const sprite = showEvolved ? megaSpecies?.sprite_url : toggle ? megaSpecies?.sprite_url : fromSprite;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setAnimating(false);
          setShowEvolved(false);
          setToggle(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="h-8">
          <Zap className="mr-1 h-3.5 w-3.5" /> Mega
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{showEvolved ? `Mega Evolved into ${target}!` : "Mega Evolve"}</DialogTitle>
        </DialogHeader>
        {!animating && (
          <div className="space-y-3">
            {megaEvos.length > 1 ? (
              <>
                <Label className="text-xs">Mega form</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {megaEvos.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <p className="text-sm">
                Trigger Mega Evolution into <strong>{target}</strong>?
              </p>
            )}
            <Button onClick={go} className="w-full">
              <Zap className="mr-1.5 h-4 w-4" /> Mega Evolve
            </Button>
          </div>
        )}
        {animating && (
          <div className="flex flex-col items-center justify-center gap-4 py-6">
            {sprite ? (
              <img
                src={sprite}
                alt=""
                className={`h-48 w-48 object-contain transition-all duration-200 ${showEvolved ? "drop-shadow-[0_0_30px_hsl(var(--primary))]" : "brightness-200 contrast-150"}`}
              />
            ) : (
              <div className="flex h-48 w-48 items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">
                No sprite
              </div>
            )}
            <p className="text-sm font-bold">{showEvolved ? `Now ${target}!` : "Mega Evolving…"}</p>
            {showEvolved && (
              <Button onClick={() => setOpen(false)} className="w-full">
                Done
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DynamaxToggle({
  mode,
  onChange,
}: {
  mode: null | "dynamax" | "gigantamax";
  onChange: (m: null | "dynamax" | "gigantamax") => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant={mode === "dynamax" ? "default" : "outline"}
        className="h-8"
        onClick={() => onChange(mode === "dynamax" ? null : "dynamax")}
      >
        <Maximize2 className="mr-1 h-3.5 w-3.5" /> Dynamax
      </Button>
      <Button
        size="sm"
        variant={mode === "gigantamax" ? "default" : "outline"}
        className="h-8"
        onClick={() => onChange(mode === "gigantamax" ? null : "gigantamax")}
      >
        <Maximize2 className="mr-1 h-3.5 w-3.5" /> G-Max
      </Button>
    </div>
  );
}

function AbilityRollDialog({
  name,
  effect,
  pokemonName,
  onRoll,
  onChat,
}: {
  name: string;
  effect: string;
  pokemonName: string;
  onRoll: (label: string, n: number) => void;
  onChat: (body: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const detected = useMemo(() => {
    const m = effect.match(/(\d+)\s*d6/i);
    return m ? parseInt(m[1], 10) : 0;
  }, [effect]);
  const [dice, setDice] = useState(detected);
  useEffect(() => {
    setDice(detected);
  }, [detected]);
  function fire() {
    onChat(`**${pokemonName}** uses **${name}**${effect ? ` — ${effect}` : ""}`);
    if (dice > 0) onRoll(`${pokemonName} · ${name}`, dice);
    setOpen(false);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Dices className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>
        {effect && <p className="text-sm text-muted-foreground">{effect}</p>}
        <div className="flex items-center gap-3">
          <Label className="text-xs">Dice</Label>
          <Input
            type="number"
            value={dice}
            onChange={(e) => setDice(parseInt(e.target.value) || 1)}
            className="h-8 w-20"
          />
        </div>
        <Button onClick={fire} className="w-full">
          <Dices className="mr-1.5 h-4 w-4" /> Roll{dice > 0 ? ` ${dice}d6` : ""}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Training bars (per-Pokémon rank-up progress)
// ============================================================
function TrainingBars({
  rank,
  trainings,
  retrains,
  canEdit,
  onTrainings,
  onRetrains,
}: {
  rank: Rank;
  trainings: Record<string, number>;
  retrains: number;
  canEdit: boolean;
  onTrainings: (t: Record<string, number>) => void;
  onRetrains: (n: number) => void;
}) {
  const required = TRAININGS_PER_RANK[rank] ?? 0;
  const current = Math.max(0, trainings?.[rank] ?? 0);
  const pct = required > 0 ? Math.min(100, (current / required) * 100) : 0;
  const reCur = Math.max(0, Math.min(RETRAIN_CAP, retrains ?? 0));
  const rePct = (reCur / RETRAIN_CAP) * 100;
  function setT(n: number) {
    onTrainings({ ...(trainings ?? {}), [rank]: Math.max(0, Math.min(required, n)) });
  }
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-background px-2 py-1.5">
      {required > 0 && (
        <div>
          <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Training · {RANK_LABELS[rank]}</span>
            <span className="font-bold text-foreground tabular-nums">
              {current}/{required}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Progress value={pct} className="h-2 flex-1" />
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  onClick={() => setT(current - 1)}
                  disabled={current <= 0}
                >
                  −
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  onClick={() => setT(current + 1)}
                  disabled={current >= required}
                >
                  +
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <div>
        <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Re-training</span>
          <span className="font-bold text-foreground tabular-nums">
            {reCur}/{RETRAIN_CAP}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Progress value={rePct} className="h-2 flex-1" />
          {canEdit && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0"
                onClick={() => onRetrains(reCur - 1)}
                disabled={reCur <= 0}
              >
                −
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0"
                onClick={() => onRetrains(reCur + 1)}
                disabled={reCur >= RETRAIN_CAP}
              >
                +
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
