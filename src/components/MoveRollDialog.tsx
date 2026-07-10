import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Dices } from "lucide-react";
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
import type { MoveRollMessage, MoveRollTarget } from "@/components/MoveCard";

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

  function setIfNumeric(next: string) {
    const isValid =
      next === "" ||
      (allowNegative && next === "-") ||
      (allowNegative ? /^-?\d+$/.test(next) : /^\d+$/.test(next));
    if (isValid) onValueChange(next);
  }

  return (
    <Input
      type="text"
      inputMode={allowNegative ? "text" : "numeric"}
      value={value}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onValueChange(normalizeIntegerInput(e.currentTarget.value, min))}
      onChange={(e) => setIfNumeric(e.currentTarget.value)}
      className={`text-center font-semibold tabular-nums ${className ?? ""}`}
    />
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
  character_kind: "trainer" | "pokemon";
  character_id: string;
};

type TargetInfo = {
  id: string;
  name: string;
  kind: "trainer" | "pokemon";
  vit: number;
  ins: number;
  types: string[];
};

function useTargetsForGame(gameId: string, enabled: boolean) {
  const tokensQ = useQuery({
    queryKey: ["mrd-tokens", gameId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tokens")
        .select("id,label,character_kind,character_id")
        .eq("game_id", gameId);
      if (error) throw error;
      return (data ?? []) as TokenLite[];
    },
  });
  const tokens = tokensQ.data ?? [];
  const ids = tokens
    .map((t) => `${t.character_kind}:${t.character_id}`)
    .sort()
    .join(",");
  const infoQ = useQuery({
    queryKey: ["mrd-target-info", gameId, ids],
    enabled: enabled && tokens.length > 0,
    queryFn: async () => {
      const pkIds = tokens.filter((t) => t.character_kind === "pokemon").map((t) => t.character_id);
      const trIds = tokens.filter((t) => t.character_kind === "trainer").map((t) => t.character_id);
      const [pkRes, trRes] = await Promise.all([
        pkIds.length
          ? supabase
              .from("pokemon")
              .select("id,current_attrs,modifiers,species:species_id(types,base_attrs)")
              .in("id", pkIds)
          : Promise.resolve({ data: [] as unknown[], error: null as unknown as null }),
        trIds.length
          ? supabase.from("trainers").select("id,attr_points,attr_bonus").in("id", trIds)
          : Promise.resolve({ data: [] as unknown[], error: null as unknown as null }),
      ]);
      if (pkRes.error) throw pkRes.error;
      if (trRes.error) throw trRes.error;
      const map = new Map<string, TargetInfo>();
      for (const t of tokens) {
        if (t.character_kind === "pokemon") {
          const row = (
            pkRes.data as Array<{
              id: string;
              current_attrs: Record<string, number> | null;
              modifiers: Record<string, unknown> | null;
              species: { types: string[]; base_attrs: Record<string, number> } | null;
            }>
          ).find((r) => r.id === t.character_id);
          if (!row) continue;
          const base = row.species?.base_attrs ?? {};
          const defBonus = Number(row.modifiers?._def_bonus ?? 0) || 0;
          const spdefBonus = Number(row.modifiers?._spdef_bonus ?? 0) || 0;
          const vit = (row.current_attrs?.vitality ?? base.vitality ?? 1) + defBonus;
          const ins = (row.current_attrs?.insight ?? base.insight ?? 1) + spdefBonus;
          map.set(t.id, { id: t.id, name: t.label, kind: "pokemon", vit, ins, types: row.species?.types ?? [] });
        } else {
          const row = (
            trRes.data as Array<{
              id: string;
              attr_points: Record<string, number> | null;
              attr_bonus: Record<string, number> | null;
            }>
          ).find((r) => r.id === t.character_id);
          if (!row) continue;
          const vit = 1 + (row.attr_points?.vitality ?? 0) + (row.attr_bonus?.vitality ?? 0);
          const ins = 1 + (row.attr_points?.insight ?? 0) + (row.attr_bonus?.insight ?? 0);
          map.set(t.id, { id: t.id, name: t.label, kind: "trainer", vit, ins, types: [] });
        }
      }
      return map;
    },
  });
  return { tokens, infoMap: infoQ.data ?? new Map<string, TargetInfo>() };
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
}) {
  const [open, setOpen] = useState(false);
  const [accBonusText, setAccBonusText] = useState("0");
  const [dmgBonusText, setDmgBonusText] = useState("0");
  const [targetDefText, setTargetDefText] = useState("0");
  const [critMarginText, setCritMarginText] = useState("0");
  const [actionsText, setActionsText] = useState("0");
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);
  const spdefUsesInsight = useGameSpdefUsesInsight(gameId);
  const effectivenessFlat = useGameEffectivenessFlat(gameId);
  const { tokens, infoMap } = useTargetsForGame(gameId, open && !isStatus);
  const extras = useMemo(() => parseMoveExtras(move.effect), [move.effect]);
  const [extraOn, setExtraOn] = useState<boolean[]>(() => extras.extra.map(() => false));
  const accBonus = readIntegerInput(accBonusText);
  const dmgBonus = readIntegerInput(dmgBonusText);
  const targetDef = readIntegerInput(targetDefText, 0);
  const critMargin = readIntegerInput(critMarginText, 0);
  const actions = readIntegerInput(actionsText, 0);

  useEffect(() => {
    if (!open) setSelectedTokenIds([]);
  }, [open]);

  const defLabel = isSpecial ? "Target Sp.Def" : "Target Def";
  const extraDmgBonus = extras.extra.reduce((acc, e, i) => acc + (extraOn[i] ? e.count : 0), 0);
  const hasTargets = selectedTokenIds.length > 0;
  const baseDmgPool = Math.max(0, dmgPool + dmgBonus + extraDmgBonus - (hasTargets ? 0 : targetDef));
  const finalAccPoolBeforePain = Math.max(0, accPool + accBonus);
  const finalAccPool = Math.max(0, finalAccPoolBeforePain - painPenalty);
  const requiredSuccesses = actions + 1;
  const critRequired = requiredSuccesses + Math.max(0, 3 - Math.max(0, critMargin));

  function defValueFor(t: TargetInfo): number {
    if (isSpecial) return spdefUsesInsight ? t.ins : t.vit;
    return t.vit;
  }

  async function confirm() {
    const accResult = rollD6(finalAccPool);
    const accSuccesses = accResult.successes;
    const isHit = accSuccesses >= requiredSuccesses;
    const isCrit = isHit && accSuccesses >= critRequired;

    let dmg: MoveRollMessage["damage"] = null;
    if (!isStatus && baseDmgPool > 0) {
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
          const finalDamage = eff.immune ? 0 : successesFlatAdj;

          targets.push({
            name: t.name,
            def,
            defStat: isSpecial ? ("spdef" as const) : ("def" as const),
            effLabel: eff.label,
            effDelta: eff.delta,
            immune: eff.immune,
            finalDamage,
            dice: rolled.dice,
            successes: rolled.successes,
          });
        }
      } else {
        const rolled = rollD6(dmgPoolAfterPain);
        aggDice = rolled.dice;
        aggSuccesses = rolled.successes;
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
    const chance = extras.chance.map((c) => {
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
        crit: { margin: critMargin, actions, required: requiredSuccesses, critRequired, isCrit },
      },
      damage: dmg,
      chance,
    };
    const { error } = await supabase.from("chat_messages").insert({
      game_id: gameId,
      user_id: userId,
      kind: "move",
      body: `${pokemonName} used ${move.name}`,
      roll_data: payload as unknown as never,
    });
    if (error) toast.error(error.message);
    setOpen(false);
    setAccBonusText("0");
    setDmgBonusText("0");
    setTargetDefText("0");
    setCritMarginText("0");
    setActionsText("0");
    setSelectedTokenIds([]);
    setExtraOn(extras.extra.map(() => false));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Dices className="mr-1.5 h-3.5 w-3.5" />{" "}
          {triggerLabel ?? `Roll ${accPool}d6${isStatus ? "" : ` / ${dmgPool}d6`}`}
        </Button>
      </DialogTrigger>
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

              <div className="rounded-md border border-border bg-muted/30 p-2">
                <Label className="text-xs font-semibold">Alvos no campo (opcional)</Label>
                <p className="text-[10px] text-muted-foreground">
                  Selecione um ou mais tokens. O dano é calculado por alvo usando {isSpecial ? "Sp.Def" : "Def"} e tipo.
                </p>
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {tokens.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhum token no campo.</p>}
                  {tokens.map((tk) => {
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
                      </label>
                    );
                  })}
                </div>
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
              )}
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
          <Button onClick={confirm} className="w-full">
            <Dices className="mr-1.5 h-4 w-4" /> Rolar & Enviar Card
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
