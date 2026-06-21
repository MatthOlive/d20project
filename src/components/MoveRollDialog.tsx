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