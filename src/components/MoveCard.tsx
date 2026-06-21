import { type ReactNode } from "react";
import { TYPE_COLORS } from "@/lib/pokerole";
import { EffectIcons } from "@/components/EffectIcons";
import { cn } from "@/lib/utils";

export type MoveCardData = {
  name: string;
  type: string;
  power: number;
  accuracyText: string; // e.g. "Dexterity + Channel"
  damagePoolText: string; // e.g. "Special + 2" (PDF style)
  effect: string;
  category?: string;
};

export type MoveRollTarget = {
  name: string;
  def: number;
  defStat: "def" | "spdef";
  effLabel: string;
  effDelta: number;
  immune: boolean;
  dice: number[];
  successes: number;
  finalDamage: number;
};

export type MoveRollMessage = {
  v: "move-1";
  card: MoveCardData;
  pokemonName: string;
  hasStab: boolean;
  imageUrl?: string | null;
  accuracy: {
    pool: number;
    dice: number[];
    successes: number;
    penalty: number;
    crit?: { margin: number; actions: number; required: number; critRequired: number; isCrit: boolean };
  };
  damage: {
    pool: number;
    dice: number[];
    successes: number;
    penalty: number;
    isStatus: boolean;
    targetDef: number;
    critBonus?: number;
    targets?: MoveRollTarget[];
  } | null;
  chance: { label: string; pool: number; dice: number[]; successes: number }[];
};

export function MoveCard({
  data,
  hasStab,
  accuracySlot,
  damageSlot,
  damageDetailsSlot,
  chanceSlot,
  rightExtras,
  footer,
  className,
  hideDamagePool,
}: {
  data: MoveCardData;
  hasStab?: boolean;
  accuracySlot?: ReactNode;
  damageSlot?: ReactNode;
  damageDetailsSlot?: ReactNode;
  chanceSlot?: ReactNode;
  rightExtras?: ReactNode;
  footer?: ReactNode;
  className?: string;
  hideDamagePool?: boolean;
}) {
  const tcol = TYPE_COLORS[data.type as keyof typeof TYPE_COLORS] ?? { bg: "#888", fg: "#fff" };
  return (
    <div
      className={cn("overflow-hidden rounded-[18px] border-2 bg-[#111418] text-[#f4f4ee] shadow-sm", className)}
      style={{ borderColor: tcol.bg }}
    >
      <div className="flex items-stretch">
        <div
          className="flex min-h-[62px] flex-1 items-center px-5 py-3"
          style={{ backgroundColor: tcol.bg, color: tcol.fg }}
        >
          <span className="truncate text-2xl font-black tracking-normal drop-shadow-sm">{data.name}</span>
          {hasStab && (
            <span className="ml-3 rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-bold uppercase">STAB</span>
          )}
        </div>
        <div className="flex w-[120px] shrink-0 flex-col items-center justify-center bg-[#202329] px-3 py-2 text-center">
          <span className="text-[13px] font-black uppercase tracking-wider text-[#9da0a8]">Power</span>
          <span className="text-3xl font-black leading-none text-white">{data.power}</span>
        </div>
      </div>

      <div className="grid gap-2 bg-[#111418] px-5 py-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3 text-base font-semibold leading-snug text-[#f4f4ee]">