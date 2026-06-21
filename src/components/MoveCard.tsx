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
    <div
      className={cn("overflow-hidden rounded-lg border-2 shadow-sm bg-card text-card-foreground", className)}
      style={{ borderColor: tcol.bg }}
    >
      <div className="flex items-center justify-between p-2 text-white" style={{ backgroundColor: tcol.bg }}>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-wide uppercase">{data.name}</span>
          {hasStab && (
            <span className="mt-0.5 inline-block self-start rounded bg-white/20 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-white">
              STAB
            </span>
          )}
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-medium opacity-80">Power</span>
          <span className="font-mono text-base font-bold leading-none">{data.power}</span>
        </div>
      </div>

      <div className="p-2.5 space-y-2 text-xs">
        <div className="grid grid-cols-2 gap-2 border-b pb-2">
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Accuracy</span>
            <div className="mt-0.5 font-medium flex items-center gap-1.5 flex-wrap min-h-5">
              {accuracySlot || data.accuracyText}
            </div>
          </div>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Damage Pool
            </span>
            <div className="mt-0.5 font-medium flex items-center gap-1.5 flex-wrap min-h-5">
              {damageSlot || data.damagePoolText}
            </div>
          </div>
        </div>

        {damageDetailsSlot && <div className="border-b pb-2">{damageDetailsSlot}</div>}

        <div>
          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Effect</span>
          <p className="mt-1 text-muted-foreground leading-relaxed whitespace-pre-wrap">{data.effect}</p>
        </div>

        {chanceSlot && <div className="border-t pt-2 space-y-1">{chanceSlot}</div>}

        {rightExtras && <div className="border-t pt-2 flex flex-wrap gap-1">{rightExtras}</div>}

        {footer && <div className="border-t pt-2">{footer}</div>}
      </div>
    </div>
  );
}

export function SuccessHover({
  label,
  successes,
  dice,
  highlight,
  tone = "success",
  emptyText,
  critInfo,
}: {
  label: string;
  successes: number;
  dice: number[];
  highlight?: (d: number) => boolean;
  tone?: "success" | "danger" | "amber";
  emptyText?: string;
  critInfo?: { required: number; critRequired: number };
}) {
  const isD6 = true;
  const isHit = highlight ?? ((d: number) => d >= 4);

  // Lógica de cor condicional baseada no 'need' apenas se critInfo (required) for passado
  let badgeBg = "bg-success text-success-foreground border-success";
  if (tone === "danger") badgeBg = "bg-destructive text-destructive-foreground border-destructive";
  if (tone === "amber") badgeBg = "bg-amber-500 text-amber-900 border-amber-500";

  if (critInfo) {
    if (successes >= critInfo.required) {
      badgeBg = "bg-success text-success-foreground border-success";
    } else {
      badgeBg = "bg-destructive text-destructive-foreground border-destructive";
    }
  }

  return (
    <span className="group relative inline-flex items-center gap-1 cursor-help overflow-visible z-30">
      <span
        className={cn(
          "inline-flex h-5 items-center justify-center rounded border px-2 text-[11px] font-bold shadow-sm transition-colors",
          badgeBg,
        )}
      >
        {successes} {label === "Hit" ? "Sucessos" : label}
      </span>

      {/* Janela flutuante original restaurada */}
      <span className="absolute bottom-full left-1/2 mb-1.5 hidden w-max max-w-[260px] -translate-x-1/2 flex-col gap-1 rounded-md border border-border bg-popover p-2 text-[11px] text-popover-foreground shadow-md group-hover:flex z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-1 duration-150">
        <span className="font-semibold text-muted-foreground block border-b pb-0.5 mb-1">Dados Rolados:</span>

        {dice.length === 0 ? (
          <span className="text-muted-foreground italic">{emptyText || "Nenhum dado."}</span>
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

        {/* Exibe o aviso "need X crit Y" maior, caso fornecido */}
        {critInfo && (
          <div className="mt-1.5 pt-1 border-t border-border/60 text-center font-semibold text-[10.5px] text-muted-foreground">
            need <span className="text-foreground font-bold">{critInfo.required}</span> crit{" "}
            <span className="text-foreground font-bold">{critInfo.critRequired}</span>
          </div>
        )}
      </span>
    </span>
  );
}
