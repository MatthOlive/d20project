import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AppearanceToken = {
  id: string;
  label: string;
  aura1_radius?: number;
  aura1_color?: string;
  aura2_radius?: number;
  aura2_color?: string;
  tint_color?: string | null;
  bar_label?: string | null;
  bar_value?: number | null;
  bar_max?: number | null;
  bar_color?: string;
};

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#22c55e", "#10b981", "#06b6d4", "#3b82f6",
  "#6366f1", "#a855f7", "#ec4899", "#ffffff",
];

export function TokenAppearanceDialog({
  token,
  open,
  onOpenChange,
}: {
  token: AppearanceToken | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [a1r, setA1r] = useState(0);
  const [a1c, setA1c] = useState("#22c55e");
  const [a2r, setA2r] = useState(0);
  const [a2c, setA2c] = useState("#3b82f6");
  const [tint, setTint] = useState<string>("");
  const [barLabel, setBarLabel] = useState("");
  const [barVal, setBarVal] = useState<string>("");
  const [barMax, setBarMax] = useState<string>("");
  const [barColor, setBarColor] = useState("#f59e0b");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    setA1r(token.aura1_radius ?? 0);
    setA1c(token.aura1_color ?? "#22c55e");
    setA2r(token.aura2_radius ?? 0);
    setA2c(token.aura2_color ?? "#3b82f6");
    setTint(token.tint_color ?? "");
    setBarLabel(token.bar_label ?? "");
    setBarVal(token.bar_value != null ? String(token.bar_value) : "");
    setBarMax(token.bar_max != null ? String(token.bar_max) : "");
    setBarColor(token.bar_color ?? "#f59e0b");
  }, [token]);

  async function save() {
    if (!token) return;
    setSaving(true);
    const payload = {
      aura1_radius: Math.max(0, Math.min(60, Number(a1r) || 0)),
      aura1_color: a1c,
      aura2_radius: Math.max(0, Math.min(60, Number(a2r) || 0)),
      aura2_color: a2c,
      tint_color: tint.trim() ? tint : null,
      bar_label: barLabel.trim() || null,
      bar_value: barVal === "" ? null : Math.max(0, Number(barVal) || 0),
      bar_max: barMax === "" ? null : Math.max(0, Number(barMax) || 0),
      bar_color: barColor,
    };
    const { error } = await (supabase
      .from("tokens")
      .update(payload as never)
      .eq("id", token.id) as unknown as Promise<{ error: { message: string } | null }>);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Aparência atualizada");
    onOpenChange(false);
  }

  function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
    return (
      <div className="flex flex-wrap gap-1">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-6 w-6 rounded border-2 ${value.toLowerCase() === c ? "border-foreground" : "border-border"}`}
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
        />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aparência — {token?.label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <section className="space-y-2 rounded-md border border-border p-3">
            <div className="font-semibold">Aura 1</div>
            <div className="flex items-center gap-2">
              <Label className="w-24 text-xs">Raio (células)</Label>
              <Input type="number" min={0} max={60} value={a1r}
                onChange={(e) => setA1r(Number(e.target.value) || 0)} className="h-8 w-24" />
            </div>
            <Swatches value={a1c} onChange={setA1c} />
          </section>

          <section className="space-y-2 rounded-md border border-border p-3">
            <div className="font-semibold">Aura 2</div>
            <div className="flex items-center gap-2">
              <Label className="w-24 text-xs">Raio (células)</Label>
              <Input type="number" min={0} max={60} value={a2r}
                onChange={(e) => setA2r(Number(e.target.value) || 0)} className="h-8 w-24" />
            </div>
            <Swatches value={a2c} onChange={setA2c} />
          </section>

          <section className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Tinting (overlay)</span>
              {tint && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setTint("")}>
                  Remover
                </Button>
              )}
            </div>
            <Swatches value={tint || "#000000"} onChange={setTint} />
            <p className="text-[11px] text-muted-foreground">
              Cor translúcida sobreposta ao token (ex.: time A/B, alvo do GM).
            </p>
          </section>

          <section className="space-y-2 rounded-md border border-border p-3">
            <div className="font-semibold">Barra customizada</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[11px]">Nome</Label>
                <Input value={barLabel} onChange={(e) => setBarLabel(e.target.value)}
                  placeholder="ex.: Mana" className="h-8" />
              </div>
              <div>
                <Label className="text-[11px]">Atual</Label>
                <Input type="number" value={barVal} onChange={(e) => setBarVal(e.target.value)}
                  className="h-8" />
              </div>
              <div>
                <Label className="text-[11px]">Máx.</Label>
                <Input type="number" value={barMax} onChange={(e) => setBarMax(e.target.value)}
                  className="h-8" />
              </div>
            </div>
            <Swatches value={barColor} onChange={setBarColor} />
            <p className="text-[11px] text-muted-foreground">
              Deixe nome ou máx. vazio para esconder a barra.
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
