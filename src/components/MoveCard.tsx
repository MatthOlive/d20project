import { type ReactNode } from "react";
import { TYPE_COLORS } from "@/lib/pokerole";
import { EffectIcons } from "@/components/EffectIcons";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

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
    targetDef?: number;
    critBonus?: number;
    targets?: MoveRollTarget[];
  } | null;
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
      <div className="flex items-center justify-between gap-2 p-2 text-white" style={{ backgroundColor: tcol.bg }}>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold tracking-wide uppercase truncate">{data.name}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className="inline-block rounded bg-black/25 px-1 py-px text-[9px] font-bold uppercase tracking-wider">
              {data.type}
            </span>
            {data.category && (
              <span className="inline-block rounded bg-white/25 px-1 py-px text-[9px] font-bold uppercase tracking-wider">
                {data.category}
              </span>
            )}
            {hasStab && (
              <span className="inline-block rounded bg-amber-400 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-amber-950">
                STAB
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="text-[10px] font-medium opacity-80">Power</span>
          <span className="font-mono text-base font-bold leading-none">{data.power}</span>
        </div>
      </div>

      <div className="p-2.5 space-y-2 text-xs">
        <div className={cn("grid gap-2 border-b pb-2", damageSlot !== null ? "grid-cols-2" : "grid-cols-1")}>
          <div>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Accuracy</span>
            <div className="mt-0.5 font-medium flex items-center gap-1.5 flex-wrap min-h-5">
              {accuracySlot || data.accuracyText}
            </div>
          </div>
          {damageSlot !== null && (
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Damage Pool
              </span>
              <div className="mt-0.5 font-medium flex items-center gap-1.5 flex-wrap min-h-5">
                {damageSlot || data.damagePoolText}
              </div>
            </div>
          )}
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

export function MoveRollResultCard({ message }: { message: MoveRollMessage }) {
  const targets = message.damage?.targets?.filter(Boolean) ?? [];
  const hasTargets = targets.length > 0;
  const crit = message.accuracy.crit;
  const chance = message.chance ?? [];
  const chanceSuccesses = chance.reduce((sum, item) => sum + item.successes, 0);
  const hasDamageBubble = !!message.damage && !message.damage.isStatus && !hasTargets;

  return (
    <div className="w-full max-w-[390px] overflow-hidden rounded-[1.75rem] border-[3px] border-neutral-950 bg-white text-neutral-950 shadow-xl">
      <div className="relative border-b-[3px] border-neutral-950 px-4 pb-2 pt-3">
        <div className="pr-24">
          <h3 className="truncate text-3xl font-black uppercase leading-none tracking-wide">{message.card.name}</h3>
          <div className="mt-1 flex max-w-full flex-wrap gap-1">
            <span className="rounded-md border-2 border-neutral-950 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none">
              {message.card.type}
            </span>
            {message.card.category && (
              <span className="rounded-md border-2 border-neutral-950 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none">
                {message.card.category}
              </span>
            )}
            {message.hasStab && (
              <span className="rounded-md bg-neutral-950 px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none text-white">
                STAB
              </span>
            )}
          </div>
        </div>
        <div className="absolute right-3 top-2 flex flex-col items-center">
          <span className="text-[21px] font-black uppercase leading-none tracking-[0.18em]">Power</span>
          <div className="mt-[-2px] flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-neutral-950 bg-white text-4xl font-black leading-none">
            {message.card.power}
          </div>
        </div>
      </div>

      <section className="border-b-[3px] border-neutral-950 px-4 py-3">
        <SectionPill>Accuracy</SectionPill>
        <div className="mt-3 grid grid-cols-[120px_1fr] items-center gap-3">
          <ResultCircle
            label="Success"
            value={message.accuracy.successes}
            dice={message.accuracy.dice}
          />
          <div className="space-y-3 text-right text-2xl font-light uppercase tracking-wide">
            <p>
              Needed <span className="ml-4 font-semibold">{crit?.required ?? 1}</span>
            </p>
            <p>
              Critical <span className="ml-4 font-semibold">{crit?.critRequired ?? 4}</span>
            </p>
          </div>
        </div>
        {crit?.isCrit && (
          <p className="mt-1 text-center text-2xl font-black uppercase leading-none">
            Critical
            <br />
            Hit
          </p>
        )}
      </section>

      {hasTargets ? (
        <section className="border-b-[3px] border-neutral-950 px-4 py-3">
          <div className="grid grid-cols-[1fr_48px_82px_42px] items-end gap-2">
            <SectionPill className="col-span-1">Per Target</SectionPill>
            <span className="text-center text-[18px] font-light uppercase leading-none">Def / SpDef</span>
            <span className="text-center text-[15px] font-light uppercase leading-none">Super / Not Very</span>
            <span className="text-center text-[18px] font-light uppercase leading-none">Dmg</span>
          </div>
          <div className="mt-2 space-y-1.5">
            {targets.map((target, index) => (
              <div key={`${target.name}-${index}`} className="grid grid-cols-[1fr_48px_82px_42px] items-center gap-2">
                <span className="truncate text-2xl font-light uppercase">{target.name}</span>
                <span className="text-center text-2xl font-light tabular-nums">{target.def}</span>
                <span className="text-center text-sm font-light uppercase leading-none">
                  {target.immune ? "Immune" : target.effLabel}
                </span>
                <span className="text-center text-2xl font-light tabular-nums">{target.finalDamage}</span>
              </div>
            ))}
          </div>
        </section>
      ) : hasDamageBubble ? (
        <section className="border-b-[3px] border-neutral-950 px-4 py-3">
          <SectionPill>Dmg</SectionPill>
          <div className="mt-3 rounded-full border-[3px] border-neutral-950 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-wide">Damage roll</p>
                <p className="truncate text-[11px] uppercase text-neutral-500">
                  {message.card.damagePoolText}
                  {message.damage?.critBonus ? ` + ${message.damage.critBonus} crit die` : ""}
                </p>
              </div>
              <ResultBadge
                label="DMG"
                value={message.damage?.successes ?? 0}
                dice={message.damage?.dice ?? []}
                tone="dark"
              />
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-4 py-3">
        <SectionPill>Effect</SectionPill>
        <div className="mt-3 grid grid-cols-[110px_1fr] gap-3">
          {chance.length > 0 ? (
            <ResultCircle
              label="Success"
              value={chanceSuccesses}
              dice={chance.flatMap((item) => item.dice)}
              highlight={(die) => die === 6}
            />
          ) : (
            <div className="hidden sm:block" />
          )}
          <div className="space-y-1 text-[18px] font-light leading-snug text-neutral-500">
            {message.card.effect ? (
              <p className="whitespace-pre-wrap">{message.card.effect}</p>
            ) : (
              <p>Sem efeito adicional.</p>
            )}
            {chance.map((item, index) => (
              <p key={`${item.label}-${index}`} className="text-sm uppercase text-neutral-700">
                {item.label}: {item.successes} success
              </p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SectionPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-lg border-[3px] border-neutral-950 px-1.5 py-0.5 text-[22px] font-black uppercase leading-none",
        className,
      )}
    >
      {children}
    </span>
  );
}

function ResultCircle({
  label,
  value,
  dice,
  highlight,
}: {
  label: string;
  value: number;
  dice: number[];
  highlight?: (die: number) => boolean;
}) {
  return (
    <HoverCard openDelay={80} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className="inline-flex cursor-help flex-col items-center">
          <span className="text-xl font-black uppercase leading-none tracking-[0.25em]">{label}</span>
          <span className="mt-[-2px] flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-neutral-950 bg-white text-6xl font-black leading-none">
            {value}
          </span>
        </span>
      </HoverCardTrigger>
      <DiceHoverContent dice={dice} highlight={highlight} />
    </HoverCard>
  );
}

function ResultBadge({
  label,
  value,
  dice,
  tone = "light",
}: {
  label: string;
  value: number;
  dice: number[];
  tone?: "light" | "dark";
}) {
  return (
    <HoverCard openDelay={80} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span
          className={cn(
            "inline-flex cursor-help items-center gap-2 rounded-full border-[3px] border-neutral-950 px-4 py-1.5 text-lg font-black uppercase",
            tone === "dark" ? "bg-neutral-950 text-white" : "bg-white text-neutral-950",
          )}
        >
          {label} <span className="text-3xl leading-none">{value}</span>
        </span>
      </HoverCardTrigger>
      <DiceHoverContent dice={dice} />
    </HoverCard>
  );
}

function DiceHoverContent({ dice, highlight }: { dice: number[]; highlight?: (die: number) => boolean }) {
  const isHit = highlight ?? ((die: number) => die >= 4);
  return (
    <HoverCardContent side="top" align="center" className="w-auto max-w-[280px] p-2">
      <span className="mb-1 block border-b pb-0.5 text-[11px] font-semibold text-muted-foreground">
        Dados rolados:
      </span>
      {dice.length === 0 ? (
        <span className="text-[11px] italic text-muted-foreground">Nenhum dado.</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {dice.map((die, index) => (
            <span
              key={index}
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[10px] font-bold",
                isHit(die)
                  ? "border-success bg-success text-success-foreground"
                  : die === 1
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border bg-muted text-foreground",
              )}
            >
              {die}
            </span>
          ))}
        </span>
      )}
    </HoverCardContent>
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
    <HoverCard openDelay={80} closeDelay={80}>
      <HoverCardTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-help">
          <span
            className={cn(
              "inline-flex h-5 items-center justify-center rounded border px-2 text-[11px] font-bold shadow-sm transition-colors",
              badgeBg,
            )}
          >
            {successes} {label === "Hit" ? "Sucessos" : label}
          </span>
        </span>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="center" className="w-auto max-w-[280px] p-2">
        <span className="font-semibold text-muted-foreground block border-b pb-0.5 mb-1 text-[11px]">
          Dados Rolados:
        </span>
        {dice.length === 0 ? (
          <span className="text-muted-foreground italic text-[11px]">{emptyText || "Nenhum dado."}</span>
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
        {critInfo && (
          <div className="mt-1.5 pt-1 border-t border-border/60 text-center font-semibold text-[10.5px] text-muted-foreground">
            need <span className="text-foreground font-bold">{critInfo.required}</span> crit{" "}
            <span className="text-foreground font-bold">{critInfo.critRequired}</span>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
