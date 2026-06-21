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

/**
 * Reusable Pokérole move card (PDF-style).
 * Accepts optional slots for accuracy / damage / chance — when provided they
 * replace the plain text descriptors with success/dice tooltips.
 */
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
            <span className="ml-2 rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              STAB
            </span>
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

          {/* REQUISITO: Se damageSlot for null, a linha inteira deixa de existir */}
          {damageSlot !== null && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-bold uppercase tracking-wider text-muted-foreground">Damage Pool:</span>
              {damageSlot ?? <span>{data.damagePoolText}</span>}
            </div>
          )}

          {damageDetailsSlot && <div className="pt-1">{damageDetailsSlot}</div>}
          {(data.effect || chanceSlot) && (
            <div className="flex flex-wrap items-start gap-1">
              <span className="font-bold uppercase tracking-wider text-muted-foreground">Added Effect:</span>
              <div className="flex-1 space-y-1">
                {data.effect && <span>{data.effect}</span>}
                {chanceSlot && <div className="flex flex-wrap items-center gap-1">{chanceSlot}</div>}
              </div>
            </div>
          )}
        </div>
        {rightExtras && <div className="flex flex-col items-end justify-start gap-1">{rightExtras}</div>}
      </div>

      <div className="space-y-2 border-t border-border bg-card px-3 py-2">
        <EffectIcons effect={data.effect} />
        {footer}
      </div>
    </div>
  );
}

export function SuccessHover({
  label,
  successes,
  dice,
  highlight,
  tone = "primary",
  emptyText,
}: {
  label: string;
  successes: number;
  dice: number[];
  highlight?: (d: number) => boolean;
  tone?: "primary" | "danger" | "amber";
  emptyText?: string;
}) {
  const isHit = highlight ?? ((d: number) => d >= 4);
  const toneCls =
    tone === "danger"
      ? "bg-destructive/15 text-destructive border-destructive/40"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-600 border-amber-500/40"
        : "bg-success/15 text-success border-success/40";
  return (
    <span className="group relative inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold tabular-nums">
      <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5", toneCls)}>
        {successes} {label}
      </span>
      <span className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-1 w-max max-w-[260px] -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100">
        {dice.length === 0 ? (
          <span className="text-[10px] text-muted-foreground">{emptyText ?? "No dice rolled"}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {dice.map((d, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[10px] font-bold",
                  isHit(d)
                    ? "border-success bg-success text-success-foreground"
                    : d === 1
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-border bg-muted text-foreground",
                )}
              >
                {d}
              </span>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}

export type MoveRollTarget = {
  name: string;
  def: number;
  defStat: "def" | "spdef";
  effLabel: string;
  effDelta: number;
  immune: boolean;
  finalDamage: number;
  dice?: number[];
  successes?: number;
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
