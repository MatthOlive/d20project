import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  preferredPokemonSprite,
  computeDefensiveEffectiveness,
} from "@/lib/pokerole";
import { ImageSourceDialog } from "@/components/ImageSourceDialog";
import { AutosaveStatus } from "@/components/AutosaveStatus";

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
import {
  canonicalEvolutionName,
  canonicalEvolutionItemName,
  getEvolutionRules,
  evaluateEvolution,
  displayEvolutionTargetName,
  type EvolutionGate,
  type EvolutionRule,
} from "@/lib/evolutions";
import { MoveRollDialog, Z_MOVE_NAMES, zMovePower, cap } from "@/components/MoveRollDialog";
import { useGameSpriteStyle } from "@/hooks/use-game-sprite-style";

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

function findEvolutionSpecies<T extends { name: string }>(catalog: T[], target: string): T | null {
  const targetKey = canonicalEvolutionName(target);
  return catalog.find((candidate) => canonicalEvolutionName(candidate.name) === targetKey) ?? null;
}

function buildEvolvedStats({
  previousSpecies,
  nextSpecies,
  currentAttrs,
  attrPoints,
  attrBonus,
  isOvergrown,
  previousMaxHp,
  previousCurrentHp,
}: {
  previousSpecies: Species;
  nextSpecies: Species;
  currentAttrs: Record<string, number>;
  attrPoints: Record<string, number>;
  attrBonus: Record<string, number>;
  isOvergrown: boolean;
  previousMaxHp: number;
  previousCurrentHp: number;
}) {
  const nextAttrs: Record<string, number> = {};
  const keys = new Set<string>([
    ...POKEMON_ATTRS,
    ...Object.keys(previousSpecies.base_attrs ?? {}),
    ...Object.keys(nextSpecies.base_attrs ?? {}),
    ...Object.keys(currentAttrs ?? {}),
  ]);

  for (const key of keys) {
    const previousBase = previousSpecies.base_attrs?.[key] ?? 1;
    const nextBase = nextSpecies.base_attrs?.[key] ?? previousBase;
    const hasTrackedInvestment = Object.prototype.hasOwnProperty.call(attrPoints ?? {}, key)
      || Object.prototype.hasOwnProperty.call(attrBonus ?? {}, key);
    const investment = hasTrackedInvestment
      ? (attrPoints?.[key] ?? 0) + (attrBonus?.[key] ?? 0)
      : (currentAttrs?.[key] ?? previousBase) - previousBase;
    const limit = Math.max(nextSpecies.attr_limits?.[key] ?? 5, nextBase);
    nextAttrs[key] = Math.max(0, Math.min(nextBase + investment, limit));
  }

  const nextMaxHp = nextSpecies.base_hp + (isOvergrown ? 1 : 0) + (nextAttrs.vitality ?? 1);
  const previousHp = Math.max(0, Math.min(previousCurrentHp, previousMaxHp));
  const missingHp = Math.max(0, previousMaxHp - previousHp);
  const nextCurrentHp = previousHp <= 0 ? 0 : Math.max(0, Math.min(nextMaxHp, nextMaxHp - missingHp));

  return {
    current_attrs: nextAttrs,
    hp: nextMaxHp,
    current_hp: nextCurrentHp,
    will: (nextAttrs.insight ?? 1) + 2,
  };
}

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
  const spriteStyle = useGameSpriteStyle(_gameId);
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
      if (error) throw new Error(error.message);
    },
    [pokemonId],
  );
  const { patch, retry: retrySave, saveState, saveError } = useDebouncedPatch<Pokemon>(queryKey, commit, 250, {
    storageKey: `d20:pending:pokemon:${userId}:${pokemonId}`,
  });
  const [nicknameDraft, setNicknameDraft] = useState("");
  const nicknameFocusedRef = useRef(false);
  const [heldItemDraft, setHeldItemDraft] = useState("");
  const heldItemFocusedRef = useRef(false);
  const [heldItemDescDraft, setHeldItemDescDraft] = useState("");
  const heldItemDescFocusedRef = useRef(false);
  const [notesDraft, setNotesDraft] = useState("");
  const notesFocusedRef = useRef(false);

  useEffect(() => {
    let movesRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshMoves = () => {
      if (movesRefreshTimer) clearTimeout(movesRefreshTimer);
      movesRefreshTimer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["pokemon-moves", pokemonId] });
      }, 100);
    };
    const channel = supabase
      .channel(`pokemon-sheet:${pokemonId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pokemon", filter: `id=eq.${pokemonId}` },
        (payload) => {
          const next = payload.new as Partial<Pokemon>;
          qc.setQueryData<Pokemon>(queryKey, (current) => current ? { ...current, ...next } : current);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pokemon_moves", filter: `pokemon_id=eq.${pokemonId}` },
        refreshMoves,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void qc.invalidateQueries({ queryKey });
          refreshMoves();
        }
      });

    return () => {
      if (movesRefreshTimer) clearTimeout(movesRefreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [pokemonId, qc, queryKey]);

  useEffect(() => {
    if (nicknameFocusedRef.current) return;
    setNicknameDraft(pokemon?.nickname ?? "");
  }, [pokemon?.id, pokemon?.nickname]);

  useEffect(() => {
    if (heldItemFocusedRef.current) return;
    setHeldItemDraft(pokemon?.held_item ?? "");
  }, [pokemon?.id, pokemon?.held_item]);

  useEffect(() => {
    if (heldItemDescFocusedRef.current) return;
    setHeldItemDescDraft(((pokemon?.modifiers as Record<string, unknown> | undefined)?._held_item_desc as string) ?? "");
  }, [pokemon?.id, pokemon?.modifiers]);

  useEffect(() => {
    if (notesFocusedRef.current) return;
    setNotesDraft(pokemon?.notes ?? "");
  }, [pokemon?.id, pokemon?.notes]);

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

  if (!pokemon) return <div className="p-4 text-sm text-muted-foreground">Loadingâ€¦</div>;
  if (!species) return <div className="p-4 text-sm text-muted-foreground">Loading speciesâ€¦</div>;

  if (!canEdit) {
    const viewImage = pokemon.image_url ?? preferredPokemonSprite(species.name, species.sprite_url, pokemon.is_shiny, spriteStyle);
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
            <div className="text-xs text-muted-foreground">VocÃª nÃ£o tem permissÃ£o para ver detalhes desta ficha.</div>
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

  async function setAttrBreakdown(key: string, delta: { points?: number; bonus?: number }) {ÛN4ŞÚ$z{-®éÜj×’—ĞĞ¢Âõ6VÆV7D6öçFVçCàĞ¢Âõ6VÆV7CàĞ¢ÂóàĞ¢—ĞĞ¢¶ÖöFRÓÓÒ&ÖVv"b`Ğ¢†ÖVvWf÷2æÆVæwF‚âò€Ğ¢ÃàĞ¢ÄÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2#äÖVvf÷&ÓÂôÆ&VÃàĞ¢Å6VÆV7BfÇVS×·F&vWGÒöåfÇVT6†ævS×·6WEF&vWGÓàĞ¢Å6VÆV7EG&–vvW#àĞ¢Å6VÆV7EfÇVRóàĞ¢Âõ6VÆV7EG&–vvW#àĞ¢Å6VÆV7D6öçFVçCàĞ¢¶ÖVvWf÷2æÖ‚†R’Óâ€Ğ¢Å6VÆV7D—FVÒ¶W“×¶WÒfÇVS×¶WÓàĞ¢¶WĞĞ¢Âõ6VÆV7D—FVÓàĞ¢’—ĞĞ¢Âõ6VÆV7D6öçFVçCàĞ¢Âõ6VÆV7CàĞ¢ÂóàĞ¢’¢€Ğ¢Ç6Æ74æÖSÒ'FW‡B×6Ò#àĞ¢G&–vvW"ÖVvWföÇWF–öâ–çFòÇ7G&öæsç·F&vWGÓÂ÷7G&öæsãğĞ¢Â÷àĞ¢’—ĞĞ¢¶ÖöFRÓÓÒ'&WfW'B"bb€Ğ¢Ç6Æ74æÖSÒ'FW‡B×6Ò#àĞ¢&WfW'BFòÇ7G&öæsç¶&6U7V6–W3òææÖRóò&&6Rf÷&Ò'ÓÂ÷7G&öæsãğĞ¢Â÷àĞ¢—ĞĞ¢Ä'WGFöàĞ¢öä6Æ–6³×²‚’ÓâG&ç6f÷&Ò†fÇ6R—Ğ¢6Æ74æÖSÒ'rÖgVÆÂ ¢F—6&ÆVC×°¢†ÖöFRÓÓÒ&WföÇfR"bb‚F&vWE7V6–W2ÇÂ‚6VÆV7FVDvFRbb6VÆV7FVDvFRç&VG’bb6VÆV7FVDvFRæÇv—56†÷r’’¢ÇÂ†ÖöFRÓÓÒ&ÖVv"bbF&vWE7V6–W2¢ÇÂ†ÖöFRÓÓÒ'&WfW'B"bb&6U7V6–W2¢Ğ¢àĞ¢Ä–6öâ6Æ74æÖSÒ&×"ÓãR‚ÓBrÓB"óâ¶Æ&VÇĞĞ¢Âô'WGFöãàĞ¢ÂöF—càĞ¢—ĞĞ¢¶æ–ÖF–ærbb€Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓB’Ób#àĞ¢¶F—7Æ–VE7&—FRò€Ğ¢Æ–ÖpĞ¢7&3×¶F—7Æ–VE7&—FWĞĞ¢ÇCÒ" Ğ¢6Æ74æÖS×¶‚ÓC‚rÓC‚ö&¦V7BÖ6öçF–âG&ç6—F–öâÖÆÂGW&F–öâÓ#G·6†÷tWföÇfVBò&G&÷×6†F÷rÕ³óó3…ö‡6Â‡f"‚Ò×&–Ö'’’•Ò"¢&'&–v‡FæW72Ó#6öçG&7BÓS'ÖĞĞ¢óàĞ¢’¢€Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚‚ÓC‚rÓC‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVB×†Â&rÖ×WFVBFW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#àĞ¢æò7&—FPĞ¢ÂöF—càĞ¢—ĞĞ¢Ç6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆB#ç·6†÷tWföÇfVBòæ÷rG¶æW‡DæÖWÒ¢G¶Æ&VÇÖ–æ~(
fÓÂ÷àĞ¢·6†÷tWföÇfVBbb€Ğ¢Ä'WGFöâöä6Æ–6³×²‚’Óâ6WD÷Vâ†fÇ6R—Ò6Æ74æÖSÒ'rÖgVÆÂ#àĞ¢FöæPĞ¢Âô'WGFöãàĞ¢—ĞĞ¢ÂöF—càĞ¢—ĞĞ¢ÂôF–Æöt6öçFVçCàĞ¢ÂôF–ÆösàĞ¢—ĞĞ¢²ò¢W‡G&FVF–6FVBÖVvWföÇfR'WGFöâv†Vâæ÷&ÖÂWföÇWF–öç2&Rf–Æ&ÆRÆöæw6–FRÖVvf÷&×2¢÷ĞĞ¢²—4ÖVvf÷&Òbb†4æ÷&ÖÂbb†4ÖVvbb€Ğ¢ÄÖVvWföÇfU7V$'WGFöàĞ¢ö¶VÖöä–C×·ö¶VÖöä–GĞĞ¢g&öÕ7&—FS×¶g&öÕ7&—FWĞ¢g&öÕ7V6–W4–C×¶g&öÕ7V6–W4–GĞ¢ÖVvWf÷3×¶ÖVvWf÷7Ğ¢&Wf–÷W57V6–W3×·&Wf–÷W57V6–W7Ğ¢7V6–W46FÆös×·7V6–W46FÆöwĞ¢7W'&VçDGG'3×¶7W'&VçDGG'7Ğ¢GG%ö–çG3×¶GG%ö–çG7Ğ¢GG$&öçW3×¶GG$&öçW7Ğ¢—4÷fW&w&÷vã×¶—4÷fW&w&÷vçĞ¢—56†–ç“×¶—56†–ç—Ğ¢Ö„‡×¶Ö„‡Ğ¢7W'&VçD‡×¶7W'&VçD‡Ğ¢7&—FU7G–ÆS×·7&—FU7G–ÆWĞ¢óà¢—ĞĞ¢ÂóàĞ¢“°Ğ§ĞĞ Ğ¦gVæ7F–öâÖVvWföÇfU7V$'WGFöâ‡°Ğ¢ö¶VÖöä–BÀĞ¢g&öÕ7&—FRÀ¢g&öÕ7V6–W4–BÀ¢ÖVvWf÷2À¢&Wf–÷W57V6–W2À¢7V6–W46FÆörÀ¢7W'&VçDGG'2À¢GG%ö–çG2À¢GG$&öçW2À¢—4÷fW&w&÷vâÀ¢—56†–ç’À¢Ö„‡À¢7W'&VçD‡À¢7&—FU7G–ÆRÀ§Ó¢°¢ö¶VÖöä–C¢7G&–æs°Ğ¢g&öÕ7&—FS¢7G&–ærÂçVÆÃ°Ğ¢g&öÕ7V6–W4–C¢7G&–æs°¢ÖVvWf÷3¢7G&–æuµÓ°¢&Wf–÷W57V6–W3¢7V6–W3°¢7V6–W46FÆös¢'&“Å–6³Å7V6–W2Â&–B"Â&æÖR#ãã°¢7W'&VçDGG'3¢&V6÷&CÇ7G&–ærÂçVÖ&W#ã°¢GG%ö–çG3¢&V6÷&CÇ7G&–ærÂçVÖ&W#ã°¢GG$&öçW3¢&V6÷&CÇ7G&–ærÂçVÖ&W#ã°¢—4÷fW&w&÷vã¢&ööÆVã°¢—56†–ç“¢&ööÆVã°¢Ö„‡¢çVÖ&W#°¢7W'&VçD‡¢çVÖ&W#°¢7&—FU7G–ÆS¢–×÷'B‚$öÆ–"÷ö¶W&öÆR"’åö¶VÖöå7&—FU7G–ÆS°§Ò’°¢6öç7B2ÒW6UVW'”6Æ–VçB‚“°Ğ¢6öç7B¶÷VâÂ6WD÷VåÒÒW6U7FFR†fÇ6R“°Ğ¢6öç7B·F&vWBÂ6WEF&vWEÒÒW6U7FFSÇ7G&–æsâ†ÖVvWf÷5³Òóò""“°Ğ¢6öç7B¶æ–ÖF–ærÂ6WDæ–ÖF–æuÒÒW6U7FFR†fÇ6R“°Ğ¢6öç7B·6†÷tWföÇfVBÂ6WE6†÷tWföÇfVEÒÒW6U7FFR†fÇ6R“°Ğ¢6öç7B·FövvÆRÂ6WEFövvÆUÒÒW6U7FFR†fÇ6R“°Ğ¢6öç7BÖVv7V6–W4–FVçF—G’ÒW6TÖVÖò€¢‚’Óâf–æDWföÇWF–öå7V6–W2‡7V6–W46FÆörÂF&vWB’À¢·7V6–W46FÆörÂF&vWEÒÀ¢“°¢6öç7B²FF¢ÖVv7V6–W2ÒçVÆÂÒÒW6UVW'’‡°¢VW'”¶W“¢²'7V6–W2Ö'’Ö–B"ÂÖVv7V6–W4–FVçF—G“òæ–EÒÀ¢Væ&ÆVC¢ÖVv7V6–W4–FVçF—G“òæ–Bbb÷VâÀ¢VW'”fã¢7–æ2‚’Óâ°¢6öç7B²FFÂW'&÷"ÒÒv—B7W&6Ræg&öÒ‚'7V6–W2"’ç6VÆV7B‚"¢"’æW‚&–B"ÂÖVv7V6–W4–FVçF—G’æ–B’ç6–ævÆR‚“°¢–b†W'&÷"’F‡&÷rW'&÷#°¢&WGW&âFF27V6–W3°¢ÒÀ¢Ò“°¢7–æ2gVæ7F–öâvò‚’°Ğ¢–b‚ÖVv7V6–W2’°Ğ¢Fö7BæW'&÷"†G·F&vWGÒæ÷Bf÷VæBæ“°Ğ¢&WGW&ã°Ğ¢ĞĞ¢6WDæ–ÖF–ær‡G'VR“°Ğ¢6WE6†÷tWföÇfVB†fÇ6R“°Ğ¢6öç7B—bÒ6WD–çFW'fÂ‚‚’Óâ6WEFövvÆR‚‡B’ÓâB’Â#S“°Ğ¢v—BæWr&öÖ—6R‚‡"’Óâ6WEF–ÖV÷WB‡"Â3’“°Ğ¢6ÆV$–çFW'fÂ†—b“°Ğ¢6WE6†÷tWföÇfVB‡G'VR“°Ğ¢6öç7BæWtÖöG3¢&V6÷&CÇ7G&–ærÂ7G&–æsâÒ°Ğ¢âââ‚‚†v—B7W&6Ræg&öÒ‚'ö¶VÖöâ"’ç6VÆV7B‚&ÖöF–f–W'2"’æW‚&–B"Âö¶VÖöä–B’ç6–ævÆR‚’’æFFòæÖöF–f–W'22&V6÷&CÀĞ¢7G&–ærÀĞ¢7G&–æpĞ¢â’óò·Ò’ÀĞ¢Ó°¢æWtÖöG2åö&6U÷7V6–W2Òg&öÕ7V6–W4–C°¢6öç7BWföÇfVE7FG2Ò'V–ÆDWföÇfVE7FG2‡°¢&Wf–÷W57V6–W2À¢æW‡E7V6–W3¢ÖVv7V6–W2À¢7W'&VçDGG'2À¢GG%ö–çG2À¢GG$&öçW2À¢—4÷fW&w&÷vâÀ¢&Wf–÷W4Ö„‡¢Ö„‡À¢&Wf–÷W47W'&VçD‡¢7W'&VçD‡À¢Ò“°¢6öç7B²W'&÷"ÒÒv—B7W&6P¢æg&öÒ‚'ö¶VÖöâ"¢çWFFR‡°¢7V6–W5ö–C¢ÖVv7V6–W2æ–BÀ¢ââæWföÇfVE7FG2À¢ÖöF–f–W'3¢æWtÖöG2À¢ÒĞ¢æW‚&–B"Âö¶VÖöä–B“°Ğ¢–b†W'&÷"’°Ğ¢Fö7BæW'&÷"†W'&÷"æÖW76vR“°Ğ¢6WDæ–ÖF–ær†fÇ6R“°Ğ¢&WGW&ã°Ğ¢ĞĞ¢2æ–çfÆ–FFUVW&–W2‡²VW'”¶W“¢²'ö¶VÖöâ"Âö¶VÖöä–EÒÒ“°Ğ¢2æ–çfÆ–FFUVW&–W2‡²VW'”¶W“¢²'7V6–W2"ÂÖVv7V6–W2æ–EÒÒ“°Ğ¢ĞĞ¢6öç7BÖVv7&—FRÒ&VfW'&VEö¶VÖöå7&—FR†ÖVv7V6–W3òææÖRÂÖVv7V6–W3òç7&—FU÷W&ÂÂ—56†–ç’Â7&—FU7G–ÆR“°¢6öç7B7&—FRÒ6†÷tWföÇfVBòÖVv7&—FR¢FövvÆRòÖVv7&—FR¢g&öÕ7&—FS°¢&WGW&â€Ğ¢ÄF–ÆöpĞ¢÷Vã×¶÷VçĞĞ¢öä÷Vä6†ævS×²†ò’Óâ°Ğ¢6WD÷Vâ†ò“°Ğ¢–b‚ò’°Ğ¢6WDæ–ÖF–ær†fÇ6R“°Ğ¢6WE6†÷tWföÇfVB†fÇ6R“°Ğ¢6WEFövvÆR†fÇ6R“°Ğ¢ĞĞ¢×ĞĞ¢àĞ¢ÄF–ÆöuG&–vvW"46†–ÆCàĞ¢Ä'WGFöâ6—¦SÒ'6Ò"f&–çCÒ'6V6öæF'’"6Æ74æÖSÒ&‚Ó‚#àĞ¢Å¦6Æ74æÖSÒ&×"Ó‚Ó2ãRrÓ2ãR"óâÖVvĞ¢Âô'WGFöãàĞ¢ÂôF–ÆöuG&–vvW#àĞ¢ÄF–Æöt6öçFVçCàĞ¢ÄF–Æöt†VFW#àĞ¢ÄF–ÆöuF—FÆSç·6†÷tWföÇfVBòÖVvWföÇfVB–çFòG·F&vWGÒ¢$ÖVvWföÇfR'ÓÂôF–ÆöuF—FÆSàĞ¢ÂôF–Æöt†VFW#àĞ¢²æ–ÖF–ærbb€Ğ¢ÆF—b6Æ74æÖSÒ'76R×’Ó2#àĞ¢¶ÖVvWf÷2æÆVæwF‚âò€Ğ¢ÃàĞ¢ÄÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2#äÖVvf÷&ÓÂôÆ&VÃàĞ¢Å6VÆV7BfÇVS×·F&vWGÒöåfÇVT6†ævS×·6WEF&vWGÓàĞ¢Å6VÆV7EG&–vvW#àĞ¢Å6VÆV7EfÇVRóàĞ¢Âõ6VÆV7EG&–vvW#àĞ¢Å6VÆV7D6öçFVçCàĞ¢¶ÖVvWf÷2æÖ‚†R’Óâ€Ğ¢Å6VÆV7D—FVÒ¶W“×¶WÒfÇVS×¶WÓàĞ¢¶WĞĞ¢Âõ6VÆV7D—FVÓàĞ¢’—ĞĞ¢Âõ6VÆV7D6öçFVçCàĞ¢Âõ6VÆV7CàĞ¢ÂóàĞ¢’¢€Ğ¢Ç6Æ74æÖSÒ'FW‡B×6Ò#àĞ¢G&–vvW"ÖVvWföÇWF–öâ–çFòÇ7G&öæsç·F&vWGÓÂ÷7G&öæsãğĞ¢Â÷àĞ¢—ĞĞ¢Ä'WGFöâöä6Æ–6³×¶v÷Ò6Æ74æÖSÒ'rÖgVÆÂ"F—6&ÆVC×²ÖVv7V6–W7Óà¢Å¦6Æ74æÖSÒ&×"ÓãR‚ÓBrÓB"óâÖVvWföÇfPĞ¢Âô'WGFöãàĞ¢ÂöF—càĞ¢—ĞĞ¢¶æ–ÖF–ærbb€Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓB’Ób#àĞ¢·7&—FRò€Ğ¢Æ–ÖpĞ¢7&3×·7&—FWĞĞ¢ÇCÒ" Ğ¢6Æ74æÖS×¶‚ÓC‚rÓC‚ö&¦V7BÖ6öçF–âG&ç6—F–öâÖÆÂGW&F–öâÓ#G·6†÷tWföÇfVBò&G&÷×6†F÷rÕ³óó3…ö‡6Â‡f"‚Ò×&–Ö'’’•Ò"¢&'&–v‡FæW72Ó#6öçG&7BÓS'ÖĞĞ¢óàĞ¢’¢€Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚‚ÓC‚rÓC‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"&÷VæFVB×†Â&rÖ×WFVBFW‡B×‡2FW‡BÖ×WFVBÖf÷&Vw&÷VæB#àĞ¢æò7&—FPĞ¢ÂöF—càĞ¢—ĞĞ¢Ç6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆB#ç·6†÷tWföÇfVBòæ÷rG·F&vWGÒ¢$ÖVvWföÇf–æ~(
b'ÓÂ÷àĞ¢·6†÷tWföÇfVBbb€Ğ¢Ä'WGFöâöä6Æ–6³×²‚’Óâ6WD÷Vâ†fÇ6R—Ò6Æ74æÖSÒ'rÖgVÆÂ#àĞ¢FöæPĞ¢Âô'WGFöãàĞ¢—ĞĞ¢ÂöF—càĞ¢—ĞĞ¢ÂôF–Æöt6öçFVçCàĞ¢ÂôF–ÆösàĞ¢“°Ğ§ĞĞ Ğ¦gVæ7F–öâG–æÖ…FövvÆR‡°Ğ¢ÖöFRÀĞ¢öä6†ævRÀĞ§Ó¢°Ğ¢ÖöFS¢çVÆÂÂ&G–æÖ‚"Â&v–vçFÖ‚#°Ğ¢öä6†ævS¢†Ó¢çVÆÂÂ&G–æÖ‚"Â&v–vçFÖ‚"’Óâfö–C°Ğ§Ò’°Ğ¢&WGW&â€Ğ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ#àĞ¢Ä'WGFöàĞ¢6—¦SÒ'6Ò Ğ¢f&–çC×¶ÖöFRÓÓÒ&G–æÖ‚"ò&FVfVÇB"¢&÷WFÆ–æR'ĞĞ¢6Æ74æÖSÒ&‚Ó‚ Ğ¢öä6Æ–6³×²‚’Óâöä6†ævR†ÖöFRÓÓÒ&G–æÖ‚"òçVÆÂ¢&G–æÖ‚"—ĞĞ¢àĞ¢ÄÖ†–Ö—¦S"6Æ74æÖSÒ&×"Ó‚Ó2ãRrÓ2ãR"óâG–æÖ€Ğ¢Âô'WGFöãàĞ¢Ä'WGFöàĞ¢6—¦SÒ'6Ò Ğ¢f&–çC×¶ÖöFRÓÓÒ&v–vçFÖ‚"ò&FVfVÇB"¢&÷WFÆ–æR'ĞĞ¢6Æ74æÖSÒ&‚Ó‚ Ğ¢öä6Æ–6³×²‚’Óâöä6†ævR†ÖöFRÓÓÒ&v–vçFÖ‚"òçVÆÂ¢&v–vçFÖ‚"—ĞĞ¢àĞ¢ÄÖ†–Ö—¦S"6Æ74æÖSÒ&×"Ó‚Ó2ãRrÓ2ãR"óârÔÖ€Ğ¢Âô'WGFöãàĞ¢ÂöF—càĞ¢“°Ğ§ĞĞ Ğ¦gVæ7F–öâ&–Æ—G•&öÆÄF–Æör‡°Ğ¢æÖRÀĞ¢VffV7BÀĞ¢ö¶VÖöäæÖRÀĞ¢öå&öÆÂÀĞ¢öä6†BÀĞ§Ó¢°Ğ¢æÖS¢7G&–æs°Ğ¢VffV7C¢7G&–æs°Ğ¢ö¶VÖöäæÖS¢7G&–æs°Ğ¢öå&öÆÃ¢†Æ&VÃ¢7G&–ærÂã¢çVÖ&W"’Óâfö–C°Ğ¢öä6†C¢†&öG“¢7G&–ær’Óâfö–C°Ğ§Ò’°Ğ¢6öç7B¶÷VâÂ6WD÷VåÒÒW6U7FFR†fÇ6R“°Ğ¢6öç7BFWFV7FVBÒW6TÖVÖò‚‚’Óâ°Ğ¢6öç7BÒÒVffV7BæÖF6‚‚ò…ÆB²•Ç2¦Cbö’“°Ğ¢&WGW&âÒò'6T–çB†Õ³ÒÂ’¢°Ğ¢ÒÂ¶VffV7EÒ“°Ğ¢6öç7B¶F–6RÂ6WDF–6UÒÒW6U7FFR†FWFV7FVB“°Ğ¢W6TVffV7B‚‚’Óâ°Ğ¢6WDF–6R†FWFV7FVB“°Ğ¢ÒÂ¶FWFV7FVEÒ“°Ğ¢gVæ7F–öâf—&R‚’°Ğ¢öä6†B†¢¢G·ö¶VÖöäæÖWÒ¢¢W6W2¢¢G¶æÖWÒ¢¢G¶VffV7Bò(	BG¶VffV7GÖ¢"'Ö“°Ğ¢–b†F–6Râ’öå&öÆÂ†G·ö¶VÖöäæÖWÒ+rG¶æÖWÖÂF–6R“°Ğ¢6WD÷Vâ†fÇ6R“°Ğ¢ĞĞ¢&WGW&â€Ğ¢ÄF–Æör÷Vã×¶÷VçÒöä÷Vä6†ævS×·6WD÷VçÓàĞ¢ÄF–ÆöuG&–vvW"46†–ÆCàĞ¢Ä'WGFöâ6—¦SÒ'6Ò"f&–çCÒ&v†÷7B#àĞ¢ÄF–6W26Æ74æÖSÒ&‚Ó2ãRrÓ2ãR"óàĞ¢Âô'WGFöãàĞ¢ÂôF–ÆöuG&–vvW#àĞ¢ÄF–Æöt6öçFVçCàĞ¢ÄF–Æöt†VFW#àĞ¢ÄF–ÆöuF—FÆSç¶æÖWÓÂôF–ÆöuF—FÆSàĞ¢ÂôF–Æöt†VFW#àĞ¢¶VffV7BbbÇ6Æ74æÖSÒ'FW‡B×6ÒFW‡BÖ×WFVBÖf÷&Vw&÷VæB#ç¶VffV7GÓÂ÷çĞĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ2#àĞ¢ÄÆ&VÂ6Æ74æÖSÒ'FW‡B×‡2#äF–6SÂôÆ&VÃàĞ¢Ä–çW@Ğ¢G—SÒ&çVÖ&W" Ğ¢fÇVS×¶F–6WĞĞ¢öä6†ævS×²†R’Óâ6WDF–6R‡'6T–çB†RçF&vWBçfÇVR’ÇÂ—ĞĞ¢6Æ74æÖSÒ&‚Ó‚rÓ# Ğ¢óàĞ¢ÂöF—càĞ¢Ä'WGFöâöä6Æ–6³×¶f—&WÒ6Æ74æÖSÒ'rÖgVÆÂ#àĞ¢ÄF–6W26Æ74æÖSÒ&×"ÓãR‚ÓBrÓB"óâ&öÆÇ¶F–6RâòG¶F–6WÖCf¢"'ĞĞ¢Âô'WGFöãàĞ¢ÂôF–Æöt6öçFVçCàĞ¢ÂôF–ÆösàĞ¢“°Ğ§ĞĞ Ğ¢òòÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓĞĞ¢òòG&–æ–ær&'2‡W"Õö¼:–Ööâ&æ²×W&öw&W72Ğ¢òòÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓÓĞĞ¦gVæ7F–öâG&–æ–æt&'2‡°Ğ¢&æ²ÀĞ¢G&–æ–æw2ÀĞ¢&WG&–ç2ÀĞ¢6äVF—BÀĞ¢öåG&–æ–æw2ÀĞ¢öå&WG&–ç2ÀĞ§Ó¢°Ğ¢&æ³¢&æ³°Ğ¢G&–æ–æw3¢&V6÷&CÇ7G&–ærÂçVÖ&W#ã°Ğ¢&WG&–ç3¢çVÖ&W#°Ğ¢6äVF—C¢&ööÆVã°Ğ¢öåG&–æ–æw3¢‡C¢&V6÷&CÇ7G&–ærÂçVÖ&W#â’Óâfö–C°Ğ¢öå&WG&–ç3¢†ã¢çVÖ&W"’Óâfö–C°Ğ§Ò’°Ğ¢6öç7B&WV—&VBÒE$”ä”äu5õU%õ$äµ·&æµÒóò°Ğ¢6öç7B7W'&VçBÒÖF‚æÖ‚ƒÂG&–æ–æw3òå·&æµÒóò“°Ğ¢6öç7B7BÒ&WV—&VBâòÖF‚æÖ–âƒÂ†7W'&VçBò&WV—&VB’¢’¢°Ğ¢6öç7B&T7W"ÒÖF‚æÖ‚ƒÂÖF‚æÖ–â…$UE$”åô4Â&WG&–ç2óò’“°Ğ¢6öç7B&U7BÒ‡&T7W"ò$UE$”åô4’¢°Ğ¢gVæ7F–öâ6WEB†ã¢çVÖ&W"’°Ğ¢öåG&–æ–æw2‡²âââ‡G&–æ–æw2óò·Ò’Â·&æµÓ¢ÖF‚æÖ‚ƒÂÖF‚æÖ–â‡&WV—&VBÂâ’’Ò“°Ğ¢ĞĞ¢&WGW&â€Ğ¢ÆF—b6Æ74æÖSÒ'76R×’ÓãR&÷VæFVBÖÖB&÷&FW"&÷&FW"Ö&÷&FW"&rÖ&6¶w&÷VæB‚Ó"’ÓãR#àĞ¢·&WV—&VBâbb€Ğ¢ÆF—càĞ¢ÆF—b6Æ74æÖSÒ&Ö"ÓãRfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâvÓ"FW‡BÕ³…ÒWW&66RG&6¶–ær×v–FW"FW‡BÖ×WFVBÖf÷&Vw&÷VæB#àĞ¢Ç7ãåG&–æ–ær+rµ$äµôÄ$TÅ5·&æµ×ÓÂ÷7ãàĞ¢Ç7â6Æ74æÖSÒ&föçBÖ&öÆBFW‡BÖf÷&Vw&÷VæBF'VÆ"ÖçV×2#àĞ¢¶7W'&VçGÒ÷·&WV—&VGĞĞ¢Â÷7ãàĞ¢ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãR#àĞ¢Å&öw&W72fÇVS×·7GÒ6Æ74æÖSÒ&‚Ó"fÆW‚Ó"óàĞ¢¶6äVF—Bbb€Ğ¢ÃàĞ¢Ä'WGFöàĞ¢6—¦SÒ'6Ò Ğ¢f&–çCÒ&v†÷7B Ğ¢6Æ74æÖSÒ&‚ÓRrÓRÓ Ğ¢öä6Æ–6³×²‚’Óâ6WEB†7W'&VçBÒ—ĞĞ¢F—6&ÆVC×¶7W'&VçBÃÒĞĞ¢àĞ¢(‰ Ğ¢Âô'WGFöãàĞ¢Ä'WGFöàĞ¢6—¦SÒ'6Ò Ğ¢f&–çCÒ&v†÷7B Ğ¢6Æ74æÖSÒ&‚ÓRrÓRÓ Ğ¢öä6Æ–6³×²‚’Óâ6WEB†7W'&VçB²—ĞĞ¢F—6&ÆVC×¶7W'&VçBãÒ&WV—&VGĞĞ¢àĞ¢°Ğ¢Âô'WGFöãàĞ¢ÂóàĞ¢—ĞĞ¢ÂöF—càĞ¢ÂöF—càĞ¢—ĞĞ¢ÆF—càĞ¢ÆF—b6Æ74æÖSÒ&Ö"ÓãRfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö&WGvVVâvÓ"FW‡BÕ³…ÒWW&66RG&6¶–ær×v–FW"FW‡BÖ×WFVBÖf÷&Vw&÷VæB#àĞ¢Ç7ãå&R×G&–æ–æsÂ÷7ãàĞ¢Ç7â6Æ74æÖSÒ&föçBÖ&öÆBFW‡BÖf÷&Vw&÷VæBF'VÆ"ÖçV×2#àĞ¢·&T7W'Ò÷µ$UE$”åô4ĞĞ¢Â÷7ãàĞ¢ÂöF—càĞ¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓãR#àĞ¢Å&öw&W72fÇVS×·&U7GÒ6Æ74æÖSÒ&‚Ó"fÆW‚Ó"óàĞ¢¶6äVF—Bbb€Ğ¢ÃàĞ¢Ä'WGFöàĞ¢6—¦SÒ'6Ò Ğ¢f&–çCÒ&v†÷7B Ğ¢6Æ74æÖSÒ&‚ÓRrÓRÓ Ğ¢öä6Æ–6³×²‚’Óâöå&WG&–ç2‡&T7W"Ò—ĞĞ¢F—6&ÆVC×·&T7W"ÃÒĞĞ¢àĞ¢(‰ Ğ¢Âô'WGFöãàĞ¢Ä'WGFöàĞ¢6—¦SÒ'6Ò Ğ¢f&–çCÒ&v†÷7B Ğ¢6Æ74æÖSÒ&‚ÓRrÓRÓ Ğ¢öä6Æ–6³×²‚’Óâöå&WG&–ç2‡&T7W"²—ĞĞ¢F—6&ÆVC×·&T7W"ãÒ$UE$”åô4ĞĞ¢àĞ¢°Ğ¢Âô'WGFöãàĞ¢ÂóàĞ¢—ĞĞ¢ÂöF—càĞ¢ÂöF—càĞ¢ÂöF—càĞ¢“°Ğ§ĞĞ