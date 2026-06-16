import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Dices } from "lucide-react";
import { toast } from "sonner";
import {
  resolveSkillValue, rollD6, SOCIAL_ATTRS, damageMultiplierFor, damageDeltaFromMultiplier,
  type TYPE_COLORS,
} from "@/lib/pokerole";
import { useGameSpdefUsesInsight } from "@/hooks/use-game-spdef-uses-insight";
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
  normal: "Breakneck Blitz", fire: "Inferno Overwhelming", water: "Hydro Vortex",
  electric: "Gigavolt Havoc", grass: "Bloom Doom", ice: "Subzero Slammer",
  fighting: "All-Out Pummeling", poison: "Acid Downpour", ground: "Tectonic Rage",
  flying: "Supersonic Skystrike", psychic: "Shattered Psyche", bug: "Savage Spin-Out",
  rock: "Continental Crush", ghost: "Never-Ending Nightmare", dragon: "Devastating Drake",
  dark: "Black Hole Eclipse", steel: "Corkscrew Crash", fairy: "Twinkle Tackle",
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
  const extraRe = /add\s+(\d+|one|two|three|four|five|six|seven|eight)\s+extra\s+dice?\s+to\s+(?:the\s+)?damage\s+pool/gi;
  while ((m = extraRe.exec(effect))) {
    const n = toN(m[1]);
    if (n > 0) {
      const before = effect.slice(Math.max(0, m.index - 200), m.index);
      const condMatch = before.match(/([^.—-]*?)$/);
      const cond = (condMatch?.[1] ?? "").trim().replace(/^if\s+/i, "").replace(/[,\s]+$/, "");
      extra.push({ count: n, label: cond || `+${n} damage dice` });
    }
  }
  return { chance, extra };
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
      return (p.social_attrs?.[key] ?? 1)
        + (p.social_attr_points?.[key] ?? 0)
        + (p.social_attr_bonus?.[key] ?? 0);
    }
    return p.current_attrs?.[key] ?? p.base_attrs?.[key] ?? 1;
  };
  const pickBestAttr = (raw: string): { name: string; value: number } => {
    const parts = raw.split("/").map((s) => s.trim()).filter(Boolean);
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
  const hasStab = !isStatus && (speciesTypes ?? []).some((t) => String(t).toLowerCase() === String(move.type).toLowerCase());
  const stabBonus = hasStab ? 1 : 0;
  const dmgPool = isStatus ? 0 : move.power + dmgPick.value + stabBonus;
  const isSpecial = catLower === "special";
  const accuracyText = `${cap(accPick.name)}${move.accuracy_skill ? ` + ${accSkill.label}` : ""}`;
  const damagePoolText = isStatus ? "—" : `${cap(dmgPick.name)} + ${move.power}${hasStab ? " + 1 STAB" : ""}`;
  return { accPool, dmgPool, isStatus, isSpecial, hasStab, accuracyText, damagePoolText };
}

export function MoveRollDialog({
  move, pokemonName, accPool, dmgPool, isStatus, isSpecial, hasStab,
  accuracyText, damagePoolText, gameId, userId, painPenalty, imageUrl,
  triggerLabel,
}: {
  move: MoveData; pokemonName: string; accPool: number; dmgPool: number;
  isStatus?: boolean; isSpecial?: boolean; hasStab?: boolean;
  accuracyText: string; damagePoolText: string;
  gameId: string; userId: string; painPenalty: number; imageUrl?: string | null;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [accBonus, setAccBonus] = useState(0);
  const [dmgBonus, setDmgBonus] = useState(0);
  const [targetDef, setTargetDef] = useState(0);
  const extras = useMemo(() => parseMoveExtras(move.effect), [move.effect]);
  const [extraOn, setExtraOn] = useState<boolean[]>(() => extras.extra.map(() => false));
  const defLabel = isSpecial ? "Target Sp.Def" : "Target Def";
  const extraDmgBonus = extras.extra.reduce((acc, e, i) => acc + (extraOn[i] ? e.count : 0), 0);
  const finalDmgPool = Math.max(0, dmgPool + dmgBonus + extraDmgBonus - targetDef);
  const finalAccPool = Math.max(0, accPool + accBonus);

  async function confirm() {
    const accResult = rollD6(finalAccPool);
    const accSuccesses = Math.max(0, accResult.successes - painPenalty);
    let dmg: MoveRollMessage["damage"] = null;
    if (!isStatus && finalDmgPool > 0) {
      const dmgResult = rollD6(finalDmgPool);
      dmg = {
        pool: finalDmgPool,
        dice: dmgResult.dice,
        successes: Math.max(0, dmgResult.successes - painPenalty),
        penalty: painPenalty,
        isStatus: false,
        targetDef,
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
    setOpen(false); setAccBonus(0); setDmgBonus(0); setTargetDef(0);
    setExtraOn(extras.extra.map(() => false));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Dices className="mr-1.5 h-3.5 w-3.5" /> {triggerLabel ?? `Roll ${accPool}d6${isStatus ? "" : ` / ${dmgPool}d6`}`}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{move.name}{hasStab ? <span className="ml-2 rounded bg-success/20 px-1.5 py-0.5 text-xs font-bold text-success">STAB +1</span> : null}</DialogTitle></DialogHeader>
        {move.effect && <p className="text-sm text-muted-foreground">{move.effect}</p>}
        <p className="text-[11px] italic text-muted-foreground">Order: 1) Accuracy → 2) Damage{extras.chance.length > 0 ? " → 3) Chance Dice (only 6s succeed)" : ""}.{painPenalty > 0 ? ` Pain Penalty −${painPenalty} applies to Accuracy & Damage successes.` : ""}</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><Label className="text-xs">Accuracy bonus dice</Label><p className="text-[11px] text-muted-foreground">Pool: {accPool}d6 → rolling {finalAccPool}d6</p></div>
            <Input type="number" value={accBonus} onChange={(e) => setAccBonus(parseInt(e.target.value) || 0)} className="h-9 w-20" />
          </div>
          {!isStatus && dmgPool > 0 && (
            <>
              <div className="flex items-center justify-between gap-3">
                <div><Label className="text-xs">Damage bonus dice</Label><p className="text-[11px] text-muted-foreground">Base: {dmgPool}d6{hasStab ? " (incl. STAB)" : ""}</p></div>
                <Input type="number" value={dmgBonus} onChange={(e) => setDmgBonus(parseInt(e.target.value) || 0)} className="h-9 w-20" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div><Label className="text-xs">{defLabel} (subtracted from damage pool)</Label><p className="text-[11px] text-muted-foreground">Final damage pool: <b>{finalDmgPool}d6</b></p></div>
                <Input type="number" min={0} value={targetDef} onChange={(e) => setTargetDef(Math.max(0, parseInt(e.target.value) || 0))} className="h-9 w-20" />
              </div>
            </>
          )}
          {extras.extra.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <Label className="text-xs font-semibold">Conditional Extra Dice</Label>
              <div className="mt-1.5 space-y-1.5">
                {extras.extra.map((e, i) => (
                  <label key={i} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={extraOn[i] ?? false}
                      onChange={(ev) => setExtraOn((arr) => arr.map((v, k) => (k === i ? ev.target.checked : v)))}
                      className="mt-0.5"
                    />
                    <span><b>+{e.count}d6</b> — {e.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {extras.chance.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
              <Label className="text-xs font-semibold">Chance Dice (auto-rolled, 6s only)</Label>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {extras.chance.map((c, i) => (
                  <li key={i}><b>{c.count}d6</b> — {c.label}</li>
                ))}
              </ul>
            </div>
          )}
          <Button onClick={confirm} className="w-full"><Dices className="mr-1.5 h-4 w-4" /> Roll & Send Card</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
