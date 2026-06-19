import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Zap, Plus, Pencil, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { parseRollCommand, rollDice } from "@/lib/pokerole";
import { toast } from "sonner";

type Macro = {
  id: string;
  user_id: string;
  game_id: string | null;
  name: string;
  command: string;
  color: string;
  visible_in_bar: boolean;
  sort_order: number;
};

const PRESET_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899"];

export function MacroBar({ gameId, userId }: { gameId: string; userId: string }) {
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Macro> | null>(null);

  const { data: macros = [] } = useQuery({
    queryKey: ["macros", gameId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("macros")
        .select("*")
        .eq("user_id", userId)
        .or(`game_id.eq.${gameId},game_id.is.null`)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Macro[];
    },
  });

  const visibleMacros = macros.filter((m) => m.visible_in_bar);

  async function runMacro(macro: Macro) {
    const cmd = macro.command.trim();
    if (!cmd) return;
    // Split by newlines so users can chain multiple commands.
    for (const line of cmd.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const roll = parseRollCommand(line);
      if (roll) {
        const result = rollDice(roll.n, roll.faces);
        const body = roll.label ?? macro.name;
        await supabase.from("chat_messages").insert({
          game_id: gameId,
          user_id: userId,
          kind: "roll",
          body,
          roll_data: { ...result, label: body },
        });
      } else {
        await supabase.from("chat_messages").insert({
          game_id: gameId,
          user_id: userId,
          kind: "chat",
          body: line,
        });
      }
    }
  }

  async function saveMacro() {
    if (!editing) return;
    const payload = {
      user_id: userId,
      game_id: editing.game_id === null ? null : (editing.game_id ?? gameId),
      name: (editing.name ?? "").trim() || "Macro",
      command: (editing.command ?? "").trim(),
      color: editing.color ?? "#ef4444",
      visible_in_bar: editing.visible_in_bar ?? true,
      sort_order: editing.sort_order ?? macros.length,
    };
    if (!payload.command) {
      toast.error("Comando vazio");
      return;
    }
    if (editing.id) {
      const { error } = await supabase.from("macros").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("macros").insert(payload);
      if (error) return toast.error(error.message);
    }
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["macros", gameId, userId] });
  }

  async function deleteMacro(id: string) {
    const { error } = await supabase.from("macros").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["macros", gameId, userId] });
  }

  return (
    <>
      <div className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent"
          title={collapsed ? "Mostrar macros" : "Recolher macros"}
        >
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {!collapsed && (
          <>
            <Zap className="h-4 w-4 text-muted-foreground" />
            <div className="flex max-w-[60vw] flex-wrap items-center gap-1 overflow-hidden">
              {visibleMacros.length === 0 && (
                <span className="px-2 text-xs italic text-muted-foreground">Sem macros — clique em + para criar</span>
              )}
              {visibleMacros.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void runMacro(m)}
                  className="rounded px-2 py-1 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 active:brightness-95"
                  style={{ backgroundColor: m.color }}
                  title={m.command}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setManageOpen(true)}
              title="Gerenciar macros"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setEditing({ visible_in_bar: true, color: "#ef4444", game_id: gameId })}
              title="Novo macro"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Macros</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {macros.length === 0 && <p className="text-sm text-muted-foreground">Nenhum macro criado ainda.</p>}
            {macros.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded border border-border p-2">
                <span className="h-4 w-4 shrink-0 rounded" style={{ backgroundColor: m.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{m.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.command}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {m.game_id ? "Este jogo" : "Global"} · {m.visible_in_bar ? "Visível na barra" : "Oculto"}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(m)} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void deleteMacro(m.id)} title="Excluir">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setEditing({ visible_in_bar: true, color: "#ef4444", game_id: gameId })}>
              <Plus className="mr-1 h-4 w-4" /> Novo macro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar macro" : "Novo macro"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="macro-name">Nome</Label>
                <Input
                  id="macro-name"
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex.: Ataque"
                />
              </div>
              <div>
                <Label htmlFor="macro-cmd">Comando</Label>
                <textarea
                  id="macro-cmd"
                  value={editing.command ?? ""}
                  onChange={(e) => setEditing({ ...editing, command: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  placeholder="/r 2d6+3 Ataque"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Use <code className="rounded bg-muted px-1">/r 2d6+3 Nome</code> para rolagens. Texto puro vira mensagem. Uma linha por comando.
                </p>
              </div>
              <div>
                <Label>Cor</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditing({ ...editing, color: c })}
                      className={`h-7 w-7 rounded border-2 ${editing.color === c ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="macro-vis"
                  checked={editing.visible_in_bar ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, visible_in_bar: !!v })}
                />
                <Label htmlFor="macro-vis" className="cursor-pointer">Visível na barra de macros</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="macro-global"
                  checked={editing.game_id === null}
                  onCheckedChange={(v) => setEditing({ ...editing, game_id: v ? null : gameId })}
                />
                <Label htmlFor="macro-global" className="cursor-pointer">Global (todos os jogos)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => void saveMacro()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
