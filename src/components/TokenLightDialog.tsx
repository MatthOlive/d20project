import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export type TokenLightInit = {
  id: string;
  label: string;
  light_enabled: boolean;
  light_radius_bright: number;
  light_radius_dim: number;
  light_color: string;
  light_angle: number;
  light_direction: number;
  vision_radius: number;
};

function isSchemaCacheColumnError(error: { message?: string } | null | undefined, columns: string[]) {
  const message = error?.message ?? "";
  return message.includes("schema cache") && columns.some((column) => message.includes(column));
}

export function TokenLightDialog({
  open, onOpenChange, init,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  init: TokenLightInit | null;
}) {
  const [enabled, setEnabled] = useState(false);
  const [bright, setBright] = useState(0);
  const [dim, setDim] = useState(0);
  const [color, setColor] = useState("#ffd27a");
  const [angle, setAngle] = useState(360);
  const [direction, setDirection] = useState(0);
  const [vision, setVision] = useState(0);

  useEffect(() => {
    if (!init) return;
    setEnabled(init.light_enabled);
    setBright(init.light_radius_bright);
    setDim(init.light_radius_dim);
    setColor(init.light_color || "#ffd27a");
    setAngle(init.light_angle || 360);
    setDirection(Math.round(((init.light_direction || 0) * 180) / Math.PI));
    setVision(init.vision_radius);
  }, [init]);

  async function save() {
    if (!init) return;
    const basePayload = {
      light_enabled: enabled,
      light_radius_bright: Math.max(0, Math.min(60, bright)),
      light_radius_dim: Math.max(0, Math.min(60, dim)),
      light_color: color,
      vision_radius: Math.max(0, Math.min(60, vision)),
    };
    const fullPayload = {
      ...basePayload,
      light_angle: Math.max(1, Math.min(360, Math.round(angle))),
      light_direction: ((Math.round(direction) % 360) * Math.PI) / 180,
    };
    const { error } = await supabase
      .from("tokens")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(fullPayload as any)
      .eq("id", init.id);
    if (isSchemaCacheColumnError(error, ["light_angle", "light_direction"])) {
      const retry = await supabase
        .from("tokens")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(basePayload as any)
        .eq("id", init.id);
      if (retry.error) { toast.error(retry.error.message); return; }
      toast.warning("Luz salva sem cone. Aplique a migracao no Supabase para ativar angulo e direcao.");
      onOpenChange(false);
      return;
    }
    if (error) { toast.error(error.message); return; }
    toast.success("Iluminação atualizada");
    onOpenChange(false);
  }

  if (!init) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{init.label} — Visão & Luz</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border p-2.5">
            <Label className="text-xs">Visão (em células)</Label>
            <Input type="number" min={0} max={60} value={vision}
              onChange={(e) => setVision(Number(e.target.value) || 0)} className="mt-1 h-8" />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Sem visão = 0. O jogador enxerga até este raio, respeitando paredes que bloqueiam visão.
            </p>
          </div>

          <div className="rounded-md border border-border p-2.5 space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(!!v)} />
              Este token emite luz
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Luz clara (células)</Label>
                <Input type="number" min={0} max={60} value={bright}
                  onChange={(e) => setBright(Number(e.target.value) || 0)} className="h-8" disabled={!enabled} />
              </div>
              <div>
                <Label className="text-[10px]">Penumbra extra (células)</Label>
                <Input type="number" min={0} max={60} value={dim}
                  onChange={(e) => setDim(Number(e.target.value) || 0)} className="h-8" disabled={!enabled} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-[10px]">Cor</Label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                disabled={!enabled} className="h-7 w-12 cursor-pointer rounded border border-border bg-transparent" />
              <span className="text-[10px] text-muted-foreground">{color}</span>
            </div>
            <div className="grid gap-2">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-[10px]">Angulo do cone</Label>
                  <span className="text-[10px] text-muted-foreground">{angle} graus</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={360}
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value) || 360)}
                  disabled={!enabled}
                  className="w-full"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label className="text-[10px]">Direcao</Label>
                  <span className="text-[10px] text-muted-foreground">{direction} graus</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={359}
                  value={direction}
                  onChange={(e) => setDirection(Number(e.target.value) || 0)}
                  disabled={!enabled || angle >= 360}
                  className="w-full"
                />
                <div className="mt-2 flex justify-center">
                  <div className="relative h-20 w-20 rounded-full border border-border bg-muted">
                    <div
                      className="absolute left-1/2 top-1/2 h-1 w-8 origin-left rounded bg-primary"
                      style={{ transform: `rotate(${direction}deg) translateY(-50%)` }}
                    />
                    <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              A luz revela área e adiciona tinta colorida. Paredes que bloqueiam luz cortam o feixe.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
