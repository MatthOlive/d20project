import { Input } from "@/components/ui/input";

/**
 * Renders Base / Points / Bonus / Total inputs for a single attribute.
 * - Base: editable for trainers; read-only for Pokémon (comes from species).
 * - Total = Base + Points + Bonus (always read-only display).
 */
export function AttrFourField({
  label,
  base,
  points,

  bonus,
  baseEditable,
  hideBase,
  disabled,
  cap,
  showCapInTotal,
  onChange,
}: {
  label: string;
  base: number;
  points: number;
  bonus: number;
  baseEditable: boolean;
  hideBase?: boolean;
  disabled?: boolean;
  cap?: number;
  /** When true, the Total cell shows "X/cap". */
  showCapInTotal?: boolean;
  onChange: (next: { base?: number; points?: number; bonus?: number }) => void;
}) {
  const total = (base || 0) + (points || 0) + (bonus || 0);
  const clamp = (n: number, allowNegative = false) => {
    if (!Number.isFinite(n)) return 0;
    if (!allowNegative && n < 0) return 0;
    if (cap !== undefined && n > cap) return cap;
    return n;
  };
  return (
    <div className={`grid items-center gap-1.5 rounded-md bg-background px-2 py-1 ${hideBase ? "grid-cols-[1fr_repeat(3,46px)]" : "grid-cols-[1fr_repeat(4,46px)]"}`}>

      <span className="text-xs font-medium uppercase">{label}</span>
      {!hideBase && (
        <Cell title="Base">
          <Input
            type="number"
            value={base ?? 0}
            disabled={disabled || !baseEditable}
            onChange={(e) => onChange({ base: clamp(parseInt(e.target.value) || 0) })}
            className="h-6 px-1 text-center text-xs"
          />
        </Cell>
      )}
      <Cell title="Pontos">
        <Input
          type="number"
          value={points ?? 0}
          disabled={disabled}
          onChange={(e) => onChange({ points: clamp(parseInt(e.target.value) || 0) })}
          className="h-6 px-1 text-center text-xs"
        />
      </Cell>
      <Cell title="Bônus">
        <Input
          type="number"
          value={bonus ?? 0}
          disabled={disabled}
          onChange={(e) => onChange({ bonus: clamp(parseInt(e.target.value) || 0, true) })}
          className="h-6 px-1 text-center text-xs"
        />
      </Cell>

      <Cell title={showCapInTotal && cap !== undefined ? `Total / Max (${cap})` : "Total"}>
        <div className="flex h-6 items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-1 text-[11px] font-bold text-primary tabular-nums">
          {total}{showCapInTotal && cap !== undefined ? <span className="opacity-60">/{cap}</span> : null}
        </div>
      </Cell>
    </div>
  );
}

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[8px] uppercase tracking-wider text-muted-foreground">{title}</span>
      {children}
    </div>
  );
}

/** Header row to label the columns once per group. */
export function AttrFourHeader() {
  return null; // labels live inside each row's <Cell>, kept for future use
}

/**
 * Numeric editor for skills (replaces dots).
 */
export function SkillNumberInput({
  value,
  disabled,
  cap = 5,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  cap?: number;
  onChange: (n: number) => void;
}) {
  return (
    <Input
      type="number"
      min={0}
      max={cap}
      value={value ?? 0}
      disabled={disabled}
      onChange={(e) => {
        const n = parseInt(e.target.value) || 0;
        onChange(Math.max(0, Math.min(cap, n)));
      }}
      className="h-6 w-14 px-1 text-center text-xs"
    />
  );
}
