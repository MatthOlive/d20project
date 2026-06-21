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
    targets?: MoveRollTarget[];
  };
  chance?: { label: string; dice: number[]; successes: number }[];
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
}) {
  const tcol = TYPE_COLORS[data.type as keyof typeof TYPE_COLORS] ?? { bg: "#888", fg: "#fff" };
  return (
    <div className={cn("overflow-hidden rounded-lg border-2 shadow-sm", className)} style={{ borderColor: tcol.bg }}>
      <div className="flex items-stretch">
        <div
          className="flex flex-1 items-center px-3 py-2"
          style={{ background: `linear-gradient(135deg, ${tcol.bg}, ${tcol.bg}cc)`, color: tcol.fg }}
        >
          <span className="truncate text-base font-extrabold tracking-wide drop-shadow-sm">{data.name}</span>
          {hasStab && (
            <span className="ml-2 rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-bold uppercase">STAB</span>
          )}
        </div>
        <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-muted px-2 py-1 text-center">
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Power</span>
          <span className="text-xl font-black leading-none text-foreground">{data.power}</span>
        </div>
      </div>

      <div className="grid gap-2 bg-card px-3 py-2 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1 text-[11px] leading-snug">
          <div>
            <span className="font-bold uppercase tracking-wider text-muted-foreground">Type: </span>
            <span className="capitalize">{data.type}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-bold uppercase tracking-wider text-muted-foreground">Accuracy:</span>
            {accuracySlot ?? <span>{data.accuracyText}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1">