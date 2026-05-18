import { cn } from "@/lib/utils";

export function DotEditor({
  value,
  max,
  cap,
  onChange,
  disabled,
}: {
  value: number;
  max: number; // total dots displayed
  cap?: number; // species/human cap; dots beyond this are visually locked
  onChange?: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < value;
        const lockedByCap = cap !== undefined && i >= cap;
        const clickable = !disabled && !lockedByCap && onChange;
        return (
          <button
            key={i}
            type="button"
            disabled={!clickable}
            onClick={() => onChange?.(filled && value === i + 1 ? i : i + 1)}
            className={cn(
              "h-4 w-4 rounded-full border transition",
              filled
                ? "border-primary bg-primary"
                : lockedByCap
                  ? "border-dashed border-border bg-transparent"
                  : "border-border bg-card",
              clickable && "hover:scale-110",
            )}
            aria-label={`Set to ${i + 1}`}
          />
        );
      })}
    </div>
  );
}
