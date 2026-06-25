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
  vision_radius: number;
};

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
  const [vision, setVision] = useState(0);

  useEffect(() => {
    if (!init) return;
    setEnabled(init.light_enabled);
    setBright(init.light_radius_bright);
    setDim(init.light_radius_dim);
    setColor(init.light_color || "#ffd27a");
    setVision(init.vision_radius);
  }, [init]);

  async function save() {
    if (!init) return;
    const { error } = await supabase
      .from("tokens")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        light_enabled: enabled,
        light_radius_bright: Math.max(0, Math.min(60, bright)),
        light_radius_dim: Math.max(0, Math.min(60, dim)),
        light_color: color,
        vision_radius: Math.max(0, Math.min(60, vision)),
      } as any)
      .eq("id", init.id);
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
