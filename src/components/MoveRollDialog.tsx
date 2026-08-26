import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Dices } from "lucide-react";
import { toast } from "sonner";
import {
  resolveSkillValue,
  rollD6,
  SOCIAL_ATTRS,
  damageMultiplierFor,
  damageDeltaFromMultiplier,
  type TYPE_COLORS,
} from "@/lib/pokerole";
import { useGameSpdefUsesInsight } from "@/hooks/use-game-spdef-uses-insight";
import { useGameEffectivenessFlat } from "@/hooks/use-game-effectiveness-flat";
import type {
  MoveReactionTarget,
  MoveRollMessage,
  MoveRollTarget,
} from "@/components/MoveCard";
import { painPenaltyFor } from "@/components/SheetRolls";
import {
  resolveMoveAccuracy,
  shouldRollMoveDamage,
  shouldRollMoveSecondaryEffects,
} from "@/lib/move-resolution";
import { emitEngineActionRolled } from "@/lib/game-engine/action-events";
import type { EngineSession } from "@/lib/game-engine/types";

export type MoveData = {
  id: string;
  name: string;
  type: keyof typeof TYPE_COLORS | string;
  power: number;
  accuracy_stat: string | null;
  accuracy_skill: string | null;
  damage_stat: string | null;
  effect: string;
  category: string;
};

export type BattleMoveRollOptions = {
  accuracyBonus: number;
  damageBonus: number;
  criticalMargin: number;
  actionsAlreadyMade: number;
  extraDamageBonus: number;
};

// Z-Move names per type (Pokérole 2.0)
export const Z_MOVE_NAMES: Record<string, string> = {
  normal: "Breakneck Blitz",
  fire: "Inferno Overwhelming",
  water: "Hydro Vortex",
  electric: "Gigavolt Havoc",
  grass: "Bloom Doom",
  ice: "Subzero Slammer",
  fighting: "All-Out Pummeling",
  poison: "Acid Downpour",
  ground: "Tectonic Rage",
  flying: "Supersonic Skystrike",
  psychic: "Shattered Psyche",
  bug: "Savage Spin-Out",
  rock: "Continental Crush",
  ghost: "Never-Ending Nightmare",
  dragon: "Devastating Drake",
  dark: "Black Hole Eclipse",
  steel: "Corkscrew Crash",
  fairy: "Twinkle Tackle",
  typeless: "Breakneck Blitz",
};

export function zMovePower(p: number): number {
  if (p <= 0) return 0;
  if (p <= 3) return p + 5;
  if (p <= 5) return p + 4;
  if (p <= 7) return p + 3;
  return p + 2;
}

export function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseMoveExtras(effect: string | null | undefined): {
  chance: { count: number; label: string }[];
  extra: { count: number; label: string }[];
} {
  const chance: { count: number; label: string }[] = [];
  const extra: { count: number; label: string }[] = [];
  if (!effect) return { chance, extra };
  const numWord: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const toN = (s: string) => (/^\d+$/.test(s) ? parseInt(s, 10) : (numWord[s.toLowerCase()] ?? 0));

  const chanceRe = /roll\s+(\d+|one|two|three|four|five|six|seven|eight)\s+chance\s+dice?\s*(?:to\s+([^.—-]+))?/gi;
  let m: RegExpExecArray | null;
  while ((m = chanceRe.exec(effect))) {
    const n = toN(m[1]);
    if (n > 0) chance.push({ count: n, label: (m[2] ?? "effect").trim().replace(/\s+/g, " ").slice(0, 80) });
  }
  const extraRe =
    /add\s+(\d+|one|two|three|four|five|six|seven|eight)\s+extra\s+dice?\s+to\s+(?:the\s+)?damage\s+pool/gi;
  while ((m = extraRe.exec(effect))) {
    const n = toN(m[1]);
    if (n > 0) {
      const before = effect.slice(Math.max(0, m.index - 200), m.index);
      const condMatch = before.match(/([^.—-]*?)$/);
      const cond = (condMatch?.[1] ?? "")
        .trim()
        .replace(/^if\s+/i, "")
        .replace(/[,\s]+$/, "");
      extra.push({ count: n, label: cond || `+${n} damage dice` });
    }
  }
  return { chance, extra };
}

function readIntegerInput(value: string, min?: number): number {
  const parsed = Number.parseInt(value, 10);
  const next = Number.isFinite(parsed) ? parsed : 0;
  return typeof min === "number" ? Math.max(min, next) : next;
}

function normalizeIntegerInput(value: string, min?: number): string {
  return String(readIntegerInput(value, min));
}

function RollNumberInput({
  value,
  onValueChange,
  min,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  min?: number;
  className?: string;
}) {
  const allowNegative = typeof min !== "number" || min < 0;
  const current = readIntegerInput(value, min);

  function setIfNumeric(next: string) {
    const isValid =
      next === "" ||
      (allowNegative && next === "-") ||
      (allowNegative ? /^-?\d+$/.test(next) : /^\d+$/.test(next));
    if (isValid) onValueChange(next);
  }

  function step(delta: number) {
    onValueChange(String(typeof min === "number" ? Math.max(min, current + delta) : current + delta));
  }

  return (
    <div
      className={`relative shrink-0 ${className ?? ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Input
        type="text"
        inputMode={allowNegative ? "text" : "numeric"}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => onValueChange(normalizeIntegerInput(e.currentTarget.value, min))}
        onChange={(e) => setIfNumeric(e.currentTarget.value)}
        className="h-full w-full pr-7 text-center font-semibold tabular-nums"
      />
      <div className="absolute bottom-1 right-1 top-1 flex w-5 flex-col overflow-hidden rounded-sm border border-border/70 bg-muted/40">
        <button
          type="button"
          aria-label="Aumentar"
          className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            step(1);
          }}
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Diminuir"
          className="flex min-h-0 flex-1 items-center justify-center border-t border-border/70 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            step(-1);
          }}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export type ComputedMoveStats = {
  accPool: number;
  dmgPool: number;
  isStatus: boolean;
  isSpecial: boolean;
  hasStab: boolean;
  accuracyText: string;
  damagePoolText: string;
};

export function computeMoveStats(
  move: MoveData,
  p: {
    current_attrs?: Record<string, number> | null;
    social_attrs?: Record<string, number> | null;
    social_attr_points?: Record<string, number> | null;
    social_attr_bonus?: Record<string, number> | null;
    skills?: Record<string, number> | null;
    base_attrs?: Record<string, number> | null;
  },
  speciesTypes: string[],
): ComputedMoveStats {
  const attrValue = (raw: string): number => {
    const key = raw.toLowerCase().trim();
    if ((SOCIAL_ATTRS as readonly string[]).includes(key)) {
      return (p.social_attrs?.[key] ?? 1) + (p.social_attr_points?.[key] ?? 0) + (p.social_attr_bonus?.[key] ?? 0);
    }
    return p.current_attrs?.[key] ?? p.base_attrs?.[key] ?? 1;
  };
  const pickBestAttr = (raw: string): { name: string; value: number } => {
    const parts = raw
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    let best: { name: string; value: number } | null = null;
    for (const part of parts) {
      const v = attrValue(part);
      if (!best || v > best.value) best = { name: part, value: v };
    }
    return best ?? { name: raw, value: 1 };
  };
  const accPick = pickBestAttr(move.accuracy_stat ?? "dexterity");
  const accSkill = resolveSkillValue(move.accuracy_skill, p.skills ?? {});
  const accPool = accPick.value + accSkill.value;
  const catLower = (move.category ?? "").toLowerCase();
  const isStatus = catLower === "support" || catLower === "status" || move.power <= 0 || !move.damage_stat;
  const dmgPick = pickBestAttr(move.damage_stat ?? "strength");
  const hasStab =
    !isStatus && (speciesTypes ?? []).some((t) => String(t).toLowerCase() === String(move.type).toLowerCase());
  const stabBonus = hasStab ? 1 : 0;
  const dmgPool = isStatus ? 0 : move.power + dmgPick.value + stabBonus;
  const isSpecial = catLower === "special";
  const accuracyText = `${cap(accPick.name)}${move.accuracy_skill ? ` + ${accSkill.label}` : ""}`;
  const damagePoolText = isStatus ? "—" : `${cap(dmgPick.name)} + ${move.power}${hasStab ? " + 1 STAB" : ""}`;
  return { accPool, dmgPool, isStatus, isSpecial, hasStab, accuracyText, damagePoolText };
}

type TokenLite = {
  id: string;
  label: string;
  character_kind: "trainer" | "pokemon" | string;
  character_id: string;
  owner_id: string;
  layer?: string | null;
};

type TargetInfo = {
  id: string;
  characterId: string;
  name: string;
  kind: "trainer" | "pokemon";
  controllerIds: string[];
  vit: number;
  ins: number;
  types: string[];
  clashPool: number;
  evadePool: number;
  painPenalty: number;
};

type CombatTargetRow = {
  token_id: string;
  character_id: string;
  character_kind: "trainer" | "pokemon";
  target_name: string;
  token_owner_id: string;
  character_owner_id: string;
  allowed_editors: string[] | null;
  vitality: number;
  insight: number;
  target_types: string[] | null;
  clash_pool: number;
  evade_pool: number;
  current_hp: number;
  max_hp: number;
};

function useCurrentMapPage(gameId: string, userId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["current-map-page", gameId, userId],
    enabled,
    staleTime: Infinity,
    queryFn: async () => {
      const [gameRes, memberRes] = await Promise.all([
        supabase.from("games").select("active_page_id,narrator_id").eq("id", gameId).single(),
        supabase
          .from("game_members")
          .select("viewing_page_id")
          .eq("game_id", gameId)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      if (gameRes.error) throw gameRes.error;
      if (memberRes.error) throw memberRes.error;
      const game = gameRes.data as { active_page_id: string | null; narrator_id: string };
      const member = memberRes.data as { viewing_page_id: string | null } | null;
      return game.narrator_id === userId
        ? game.active_page_id
        : member?.viewing_page_id ?? game.active_page_id;
    },
  });
}

function useTargetsForGame(gameId: string, pageId: string | null | undefined, enabled: boolean) {
  const tokensQ = useQuery({
    // Reuse the map's live token cache. This keeps target selection on the
    // current page without issuing a second token query for every move dialog.
    queryKey: ["tokens", gameId, pageId],
    enabled: enabled && !!pageId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tokens")
        .select("*")
        .eq("game_id", gameId)
        .eq("page_id", pageId!);
      if (error) throw error;
      return (data ?? []) as TokenLite[];
    },
  });
  const tokens = useMemo(
    () => (tokensQ.data ?? []).filter(
      (token) =>
        (token.layer ?? "tokens") === "tokens" &&
        (token.character_kind === "pokemon" || token.character_kind === "trainer"),
    ),
    [tokensQ.data],
  );
  const ids = tokens
    .map((t) => `${t.character_kind}:${t.character_id}`)
    .sort()
    .join(",");
  const infoQ = useQuery({
    queryKey: ["mrd-target-info", gameId, pageId, ids],
    enabled: enabled && !!pageId && tokens.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        args: { p_game_id: string; p_page_id: string },
      ) => Promise<{ data: CombatTargetRow[] | null; error: { message: string } | null }>;
      const { data, error } = await rpc("get_move_target_info", {
        p_game_id: gameId,
        p_page_id: pageId!,
      });
      if (error) throw new Error(error.message);
      const rowsByTokenId = new Map((data ?? []).map((row) => [row.token_id, row]));
      const map = new Map<string, TargetInfo>();
      for (const t of tokens) {
        const row = rowsByTokenId.get(t.id);
        if (!row) continue;
        map.set(t.id, {
          id: t.id,
          characterId: row.character_id,
          name: row.target_name || t.label,
          kind: row.character_kind,
          controllerIds: [
            ...new Set([
              row.character_owner_id,
              row.token_owner_id,
              ...(row.allowed_editors ?? []),
            ].filter(Boolean)),
          ],
          vit: row.vitality,
          ins: row.insight,
          types: row.target_types ?? [],
          clashPool: row.clash_pool,
          evadePool: row.evade_pool,
          painPenalty: painPenaltyFor(row.current_hp, row.max_hp),
        });
      }
      return map;
    },
    retry: 2,
  });
  return {
    tokens,
    infoMap: infoQ.data ?? new Map<string, TargetInfo>(),
    targetInfoError: infoQ.error,
    targetInfoLoading: infoQ.isFetching,
  };
}

export function MoveRollDialog({
  move,
  pokemonName,
  accPool,
  dmgPool,
  isStatus,
  isSpecial,
  hasStab,
  accuracyText,
  damagePoolText,
  gameId,
  userId,
  painPenalty,
  imageUrl,
  triggerLabel,
  initialActions,
  controlledOpen,
  onControlledOpenChange,
  hideTrigger = false,
  battleMode = false,
  onBattleConfirm,
  characterId,
  characterKind = "pokemon",
  tokenId,
}: {
  move: MoveData;
  pokemonName: string;
  accPool: number;
  dmgPool: number;
  isStatus?: boolean;
  isSpecial?: boolean;
  hasStab?: boolean;
  accuracyText: string;
  damagePoolText: string;
  gameId: string;
  userId: string;
  painPenalty: number;
  imageUrl?: string | null;
  triggerLabel?: string;
  initialActions?: number;
  controlledOpen?: boolean;
  onControlledOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  battleMode?: boolean;
  onBattleConfirm?: (options: BattleMoveRollOptions) => Promise<boolean | void>;
  characterId?: string;
  characterKind?: "pokemon" | "trainer" | "t20";
  tokenId?: string | null;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [accBonusText, setAccBonusText] = useState("0");
  const [dmgBonusText, setDmgBonusText] = useState("0");
  const [targetDefText, setTargetDefText] = useState("0");
  const [critMarginText, setCritMarginText] = useState("0");
  const [actionsText, setActionsText] = useState("0");
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const spdefUsesInsight = useGameSpdefUsesInsight(gameId);
  const effectivenessFlat = useGameEffectivenessFlat(gameId);
  const targetSelectionEnabled = open && !isStatus && !battleMode;
  const { data: currentPageId } = useCurrentMapPage(gameId, userId, targetSelectionEnabled);
  const { tokens, infoMap, targetInfoError, targetInfoLoading } = useTargetsForGame(
    gameId,
    currentPageId,
    targetSelectionEnabled,
  );
  const targetGroups = useMemo(
    () => [
      {
        key: "pokemon",
        label: "Pokémon",
        tokens: tokens.filter((token) => token.character_kind === "pokemon"),
      },
      {
        key: "trainer",
        label: "Treinadores",
        tokens: tokens.filter((token) => token.character_kind === "trainer"),
      },
    ].filter((group) => group.tokens.length > 0),
    [tokens],
  );
  const extras = useMemo(() => parseMoveExtras(move.effect), [move.effect]);
  const [extraOn, setExtraOn] = useState<boolean[]>(() => extras.extra.map(() => false));
  const accBonus = readIntegerInput(accBonusText);
  const dmgBonus = readIntegerInput(dmgBonusText);
  const targetDef = readIntegerInput(targetDefText, 0);
  const critMargin = readIntegerInput(critMarginText, 0);
  const actions = readIntegerInput(actionsText, 0);
  const { data: engineSession = null } = useQuery<EngineSession | null>({
    queryKey: ["game-engine-session", gameId],
    queryFn: async () => {
      const query = supabase.from("game_engine_sessions" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{
              data: EngineSession | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
      const { data, error } = await query.select("*").eq("game_id", gameId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!characterId,
    retry: false,
  });
  const engineParticipant = useMemo(() => {
    if (!characterId || !engineSession || engineSession.status !== "running") return null;
    const matching = engineSession.state.participants.filter(
      (participant) =>
        participant.characterId === characterId && participant.kind === characterKind,
    );
    const current = engineSession.state.participants[engineSession.state.turnIndex] ?? null;
    return (
      matching.find((participant) => tokenId && participant.tokenId === tokenId) ??
      matching.find((participant) => participant.id === current?.id) ??
      matching.find((participant) => participant.ownerId === userId) ??
      null
    );
  }, [characterId, characterKind, engineSession, tokenId, userId]);
  const effectiveInitialActions = initialActions ?? engineParticipant?.actionsUsed ?? 0;

  function changeOpen(next: boolean) {
    setInternalOpen(next);
    onControlledOpenChange?.(next);
  }

  useEffect(() => {
    if (open) setActionsText(String(Math.max(0, effectiveInitialActions)));
    else setSelectedTokenIds([]);
  }, [effectiveInitialActions, open]);

  useEffect(() => {
    if (!open) return;
    const validTokenIds = new Set(tokens.map((target) => target.id));
    setSelectedTokenIds((current) => current.filter((id) => validTokenIds.has(id)));
  }, [open, tokens]);

  const defLabel = isSpecial ? "Target Sp.Def" : "Target Def";
  const extraDmgBonus = extras.extra.reduce((acc, e, i) => acc + (extraOn[i] ? e.count : 0), 0);
  const hasTargets = selectedTokenIds.length > 0;
  const selectedTargetsReady = selectedTokenIds.every((tokenId) => infoMap.has(tokenId));
  const baseDmgPool = Math.max(0, dmgPool + dmgBonus + extraDmgBonus - (hasTargets ? 0 : targetDef));
  const finalAccPoolBeforePain = Math.max(0, accPool + accBonus);
  const finalAccPool = Math.max(0, finalAccPoolBeforePain - painPenalty);
  const thresholds = resolveMoveAccuracy(0, actions, critMargin);
  const requiredSuccesses = thresholds.requiredSuccesses;
  const critRequired = thresholds.criticalSuccesses;

  function defValueFor(t: TargetInfo): number {
    if (isSpecial) return spdefUsesInsight ? t.ins : t.vit;
    return t.vit;
  }

  async function confirm() {
    if (isSubmitting) return;
    if (onBattleConfirm) {
      setIsSubmitting(true);
      try {
        const completed = await onBattleConfirm({
          accuracyBonus: accBonus,
          damageBonus: dmgBonus,
          criticalMargin: critMargin,
          actionsAlreadyMade: actions,
          extraDamageBonus: extraDmgBonus,
        });
        if (completed !== false) {
          changeOpen(false);
          setAccBonusText("0");
          setDmgBonusText("0");
          setTargetDefText("0");
          setCritMarginText("0");
          setSelectedTokenIds([]);
          setExtraOn(extras.extra.map(() => false));
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    if (hasTargets && !selectedTargetsReady) {
      toast.error("Aguarde os dados dos alvos carregarem.");
      return;
    }
    setIsSubmitting(true);
    const accResult = rollD6(finalAccPool);
    const accSuccesses = accResult.successes;
    const accuracyOutcome = resolveMoveAccuracy(accSuccesses, actions, critMargin);
    const isHit = accuracyOutcome.isHit;
    const isCrit = accuracyOutcome.isCritical;
    const resolutionId = crypto.randomUUID();
    const requestIdByToken = new Map(
      selectedTokenIds.map((selectedTokenId) => [selectedTokenId, crypto.randomUUID()]),
    );
    const reactionTargets: MoveReactionTarget[] = isHit
      ? selectedTokenIds.flatMap((selectedTokenId) => {
          const target = infoMap.get(selectedTokenId);
          const requestId = requestIdByToken.get(selectedTokenId);
          if (!target || !requestId) return [];
          return [{
            requestId,
            tokenId: target.id,
            characterId: target.characterId,
            characterKind: target.kind,
            name: target.name,
            controllerIds: target.controllerIds,
            clashPool: target.clashPool,
            evadePool: target.evadePool,
            painPenalty: target.painPenalty,
          }];
        })
      : [];

    let dmg: MoveRollMessage["damage"] = null;
    if (shouldRollMoveDamage(isHit, !!isStatus, baseDmgPool)) {
      const dmgPoolAfterPain = Math.max(0, baseDmgPool - painPenalty + (isCrit ? 1 : 0));

      let aggDice: number[] = [];
      let aggSuccesses = 0;
      let targets: MoveRollTarget[] | undefined;

      if (hasTargets) {
        targets = [];
        for (const tid of selectedTokenIds) {
          const t = infoMap.get(tid);
          if (!t) continue;
          const def = defValueFor(t);
          const mult = damageMultiplierFor(move.type as string, t.types);
          const eff = damageDeltaFromMultiplier(mult);
          const effDicePool = effectivenessFlat ? 0 : eff.delta;
          const tgtPool = Math.max(0, dmgPoolAfterPain + effDicePool - def);
          const rolled = eff.immune ? { dice: [] as number[], successes: 0 } : rollD6(tgtPool);
          const successesFlatAdj = effectivenessFlat ? Math.max(0, rolled.successes + eff.delta) : rolled.successes;
          const finalDamage = eff.immune ? 0 : Math.max(1, successesFlatAdj);

          targets.push({
            requestId: requestIdByToken.get(tid),
            tokenId: tid,
            name: t.name,
            def,
            defStat: isSpecial ? ("spdef" as const) : ("def" as const),
            effLabel: eff.label,
            effDelta: eff.delta,
            immune: eff.immune,
            finalDamage,
            dice: rolled.dice,
            successes: rolled.successes,
            basePool: dmgPoolAfterPain,
            pool: tgtPool,
            effectivenessMode: effectivenessFlat ? "successes" : "dice",
          });
        }
      } else {
        const rolled = rollD6(dmgPoolAfterPain);
        aggDice = rolled.dice;
        aggSuccesses = Math.max(1, rolled.successes);
      }

      dmg = {
        pool: dmgPoolAfterPain,
        dice: hasTargets ? [] : aggDice,
        successes: hasTargets ? 0 : aggSuccesses,
        penalty: painPenalty,
        isStatus: false,
        targetDef: hasTargets ? 0 : targetDef,
        critBonus: isCrit ? 1 : 0,
        targets,
      };
    }
    const chance = (shouldRollMoveSecondaryEffects(isHit) ? extras.chance : []).map((c) => {
      const r = rollD6(c.count);
      return {
        label: c.label,
        pool: c.count,
        dice: r.dice,
        successes: r.dice.filter((d) => d === 6).length,
      };
    });
    const payload: MoveRollMessage = {
      v: "move-1",
      phase: "accuracy",
      resolutionId,
      attacker: {
        characterId,
        characterKind,
        tokenId,
      },
      reactionTargets,
      pokemonName,
      hasStab: !!hasStab,
      imageUrl: imageUrl ?? null,
      card: {
        name: move.name,
        type: move.type as string,
        power: move.power,
        accuracyText,
        damagePoolText,
        effect: move.effect ?? "",
        category: move.category,
      },
      accuracy: {
        pool: finalAccPool,
        dice: accResult.dice,
        successes: accSuccesses,
        penalty: painPenalty,
        isHit,
        crit: { margin: critMargin, actions, required: requiredSuccesses, critRequired, isCrit },
      },
      damage: dmg,
      chance,
    };
    const { error } = await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "move",
      body: `${pokemonName} used ${move.name} · Accuracy`,
      roll_data: payload as unknown as never,
    });
    if (error) {
      toast.error(`Não foi possível enviar a rolagem: ${error.message}`);
      setIsSubmitting(false);
      return;
    }
    if (!isHit || reactionTargets.length === 0) {
      const { error: resolutionError } = await supabase.from("chat_messages").insert({
        game_id: gameId,
        user_id: userId,
        kind: "move",
        body: `${pokemonName} used ${move.name} · Damage & Effects`,
        roll_data: {
          ...payload,
          phase: "resolution",
          reactions: [],
        } as unknown as never,
      });
      if (resolutionError) {
        toast.error(`A acurácia foi enviada, mas o restante do move falhou: ${resolutionError.message}`);
      }
    }
    if (characterId) {
      emitEngineActionRolled({
        gameId,
        tokenId,
        characterId,
        characterKind,
        actionType: "move",
        label: move.name,
        resultSuccesses: accSuccesses,
      });
    }
    changeOpen(false);
    setAccBonusText("0");
    setDmgBonusText("0");
    setTargetDefText("0");
    setCritMarginText("0");
    setActionsText("0");
    setSelectedTokenIds([]);
    setExtraOn(extras.extra.map(() => false));
    setIsSubmitting(false);
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Dices className="mr-1.5 h-3.5 w-3.5" />{" "}
            {triggerLabel ?? `Roll ${accPool}d6${isStatus ? "" : ` / ${dmgPool}d6`}`}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {move.name}
            {hasStab ? (
              <span className="ml-2 rounded bg-success/20 px-1.5 py-0.5 text-xs font-bold text-success">STAB +1</span>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        {move.effect && <p className="text-sm text-muted-foreground">{move.effect}</p>}
        <p className="text-[11px] italic text-muted-foreground">
          Ordem: 1) Acurácia → 2) Dano{extras.chance.length > 0 ? " → 3) Chance Dice (apenas 6 contam)" : ""}.
          {painPenalty > 0 ? ` Pain Penalty −${painPenalty} dado(s) em Acurácia & Dano.` : ""}{" "}
          {effectivenessFlat ? "Efetividade: regra da casa (+/− sucessos)." : "Efetividade: RAW (+/− dados na pool)."}
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">Bônus de acurácia (dados)</Label>
              <p className="text-[11px] text-muted-foreground">
                Pool: {accPool}d6 → rolando {finalAccPool}d6
              </p>
            </div>
            <RollNumberInput
              value={accBonusText}
              onValueChange={setAccBonusText}
              className="h-9 w-20"
            />
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-2">
            <Label className="text-xs font-semibold">Crítico & Ações</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Margem de crítico</Label>
                <RollNumberInput
                  min={0}
                  value={critMarginText}
                  onValueChange={setCritMarginText}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Ações já feitas no turno</Label>
                <RollNumberInput
                  min={0}
                  value={actionsText}
                  onValueChange={setActionsText}
                  className="h-8"
                />
              </div>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Acertar: <b>{requiredSuccesses}</b> sucesso(s). Crítico: <b>{critRequired}</b> sucesso(s). Crítico
              adiciona 1 dado extra ao dano.
            </p>
          </div>

          {!isStatus && dmgPool > 0 && (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-xs">Bônus de dano (dados)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Base: {dmgPool}d6{hasStab ? " (incl. STAB)" : ""}
                  </p>
                </div>
                <RollNumberInput
                  value={dmgBonusText}
                  onValueChange={setDmgBonusText}
                  className="h-9 w-20"
                />
              </div>

              {battleMode ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  O alvo e a defesa serão calculados automaticamente pela batalha.
                </div>
              ) : <><div className="rounded-md border border-border bg-muted/30 p-2">
                <Label className="text-xs font-semibold">Alvos no campo (opcional)</Label>
                <p className="text-[10px] text-muted-foreground">
                  Selecione um ou mais tokens. O dano é calculado por alvo usando {isSpecial ? "Sp.Def" : "Def"} e tipo.
                </p>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {tokens.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhum token no campo.</p>}
                  {targetGroups.map((group) => (
                    <section key={group.key} className="space-y-1" aria-label={group.label}>
                      <div className="sticky top-0 z-10 flex items-center justify-between bg-muted px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground">
                        <span>{group.label}</span>
                        <span>{group.tokens.length}</span>
                      </div>
                      {group.tokens.map((tk) => {
                        const info = infoMap.get(tk.id);
                        const checked = selectedTokenIds.includes(tk.id);
                        const def = info ? defValueFor(info) : null;
                        const mult = info ? damageMultiplierFor(move.type as string, info.types) : 1;
                        const eff = damageDeltaFromMultiplier(mult);
                        return (
                          <label
                            key={tk.id}
                            className="flex items-center gap-2 rounded border border-border bg-card/50 p-1.5 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(ev) =>
                                setSelectedTokenIds((arr) =>
                                  ev.target.checked ? [...arr, tk.id] : arr.filter((x) => x !== tk.id),
                                )
                              }
                            />
                            <span className="flex-1 truncate font-semibold">{tk.label}</span>
                            {info && (
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span>
                                  {isSpecial ? "SpDef" : "Def"} {def}
                                </span>
                                <span className="rounded bg-muted px-1">{eff.label}</span>
                              </span>
                            )}
                            {!info && !targetInfoLoading && (
                              <span className="text-[10px] font-semibold text-destructive">
                                Dados indisponíveis
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </section>
                  ))}
                </div>
                {hasTargets && !selectedTargetsReady && targetInfoLoading && (
                  <p className="mt-1 text-[10px] font-semibold text-muted-foreground">Carregando dados dos alvos…</p>
                )}
                {targetInfoError && (
                  <p className="mt-1 text-[10px] font-semibold text-destructive">
                    Não foi possível carregar Defesa e tipo dos alvos. Atualize a mesa após aplicar a migração do banco.
                  </p>
                )}
              </div>

              {!hasTargets && (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-xs">{defLabel} manual</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Pool de dano base: <b>{baseDmgPool}d6</b> (Def reduz dados)
                      {painPenalty > 0 ? ` · −${painPenalty} dado(s) por dor` : ""}
                    </p>
                  </div>
                  <RollNumberInput
                    min={0}
                    value={targetDefText}
                    onValueChange={setTargetDefText}
                    className="h-9 w-20"
                  />
                </div>
              )}</>}
            </>
          )}
          {extras.extra.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <Label className="text-xs font-semibold">Dados extras condicionais</Label>
              <div className="mt-1.5 space-y-1.5">
                {extras.extra.map((e, i) => (
                  <label key={i} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={extraOn[i] ?? false}
                      onChange={(ev) => setExtraOn((arr) => arr.map((v, k) => (k === i ? ev.target.checked : v)))}
                      className="mt-0.5"
                    />
                    <span>
                      <b>+{e.count}d6</b> — {e.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {extras.chance.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
              <Label className="text-xs font-semibold">Chance Dice (auto, apenas 6)</Label>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {extras.chance.map((c, i) => (
                  <li key={i}>
                    <b>{c.count}d6</b> — {c.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button
            onClick={confirm}
            className="w-full"
            disabled={isSubmitting || (hasTargets && !selectedTargetsReady)}
          >
            <Dices className="mr-1.5 h-4 w-4" /> {isSubmitting ? "Enviando…" : "Rolar & Enviar Card"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
