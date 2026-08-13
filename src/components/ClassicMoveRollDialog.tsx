import { useEffect, useState } from "react";
import { Dices, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { MoveData } from "@/components/MoveRollDialog";

export type BattleMoveRollOptions = {
  accuracyBonus: number;
  damageBonus: number;
  criticalMargin: number;
  actionsAlreadyMade: number;
  extraDamageBonus: number;
};

type Props = {
  open: boolean;
  move: MoveData;
  pokemonName: string;
  accPool: number;
  dmgPool: number;
  isStatus: boolean;
  hasStab: boolean;
  accuracyText: string;
  damagePoolText: string;
  painPenalty: number;
  imageUrl?: string | null;
  initialActions: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (options: BattleMoveRollOptions) => Promise<boolean | void>;
};

function numberFrom(value: string) {
  const parsed = Number.parseInt(value || "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ClassicMoveRollDialog({
  open,
  move,
  pokemonName,
  accPool,
  dmgPool,
  isStatus,
  hasStab,
  accuracyText,
  damagePoolText,
  painPenalty,
  imageUrl,
  initialActions,
  onOpenChange,
  onConfirm,
}: Props) {
  const [accuracyBonus, setAccuracyBonus] = useState("0");
  const [damageBonus, setDamageBonus] = useState("0");
  const [criticalMargin, setCriticalMargin] = useState("0");
  const [actions, setActions] = useState(String(initialActions));
  const [extraDamage, setExtraDamage] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccuracyBonus("0");
    setDamageBonus("0");
    setCriticalMargin("0");
    setActions(String(Math.max(0, initialActions)));
    setExtraDamage("0");
  }, [initialActions, open, move.id]);

  const resolvedActions = Math.max(0, numberFrom(actions));
  const requiredSuccesses = resolvedActions + 1;
  const finalAccuracyPool = Math.max(0, accPool - painPenalty + numberFrom(accuracyBonus));
  const finalDamagePool = Math.max(0, dmgPool + numberFrom(damageBonus) + numberFrom(extraDamage));

  async function confirm() {
    setBusy(true);
    try {
      const completed = await onConfirm({
        accuracyBonus: numberFrom(accuracyBonus),
        damageBonus: numberFrom(damageBonus),
        criticalMargin: numberFrom(criticalMargin),
        actionsAlreadyMade: resolvedActions,
        extraDamageBonus: numberFrom(extraDamage),
      });
      if (completed !== false) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {imageUrl && <img src={imageUrl} alt="" className="h-12 w-12 object-contain [image-rendering:pixelated]" />}
            <span>
              <span className="block text-xs font-bold uppercase text-muted-foreground">{pokemonName}</span>
              {move.name}
            </span>
          </DialogTitle>
        </DialogHeader>

        {move.effect && <p className="text-sm leading-relaxed text-muted-foreground">{move.effect}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <section className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">Acuracia</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{finalAccuracyPool}d6</p>
            <p className="text-xs text-muted-foreground">{accuracyText}</p>
          </section>
          <section className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">{isStatus ? "Move de status" : "Dano"}</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{isStatus ? "-" : `${finalDamagePool}d6`}</p>
            <p className="text-xs text-muted-foreground">{damagePoolText}{hasStab ? " (incl. STAB)" : ""}</p>
          </section>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Bonus de acuracia" value={accuracyBonus} onChange={setAccuracyBonus} />
          <NumberField label="Margem de critico" value={criticalMargin} onChange={setCriticalMargin} min={0} />
          <NumberField label="Acoes ja feitas no turno" value={actions} onChange={setActions} min={0} />
          {!isStatus && <NumberField label="Bonus de dano" value={damageBonus} onChange={setDamageBonus} />}
          {!isStatus && <NumberField label="Dados extras" value={extraDamage} onChange={setExtraDamage} />}
        </div>

        <div className="rounded-lg border border-primary/35 bg-primary/10 p-3 text-sm">
          Esta e a acao <strong>{requiredSuccesses}</strong> do turno e precisa de <strong>{requiredSuccesses} sucesso(s)</strong>.
        </div>

        <Button onClick={() => void confirm()} disabled={busy || finalAccuracyPool <= 0} className="w-full">
          {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Dices className="mr-2 h-4 w-4" />}
          Rolar move
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
}) {
  return (
    <label className="space-y-1.5 text-sm font-bold">
      <span>{label}</span>
      <Input type="number" min={min} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
