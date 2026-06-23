import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import { toast } from "sonner";

type Kind = "pokemon" | "trainer";

export function SheetPermissionsDialog({
  kind,
  entityId,
  gameId,
  isNarrator,
}: {
  kind: Kind;
  entityId: string;
  gameId: string;
  isNarrator: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const table = kind === "pokemon" ? "pokemon" : "trainers";

  const { data: row } = useQuery({
    queryKey: [table, entityId, "perms"],
    enabled: open,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = kind === "pokemon" ? supabase.from("pokemon") : supabase.from("trainers");
      const { data, error } = await q.select("owner_id, allowed_editors, allowed_viewers").eq("id", entityId).single();
      if (error) throw error;
      return data as { owner_id: string; allowed_editors: string[]; allowed_viewers: string[] };
    },
  });

  const { data: members } = useQuery({
    queryKey: ["game-members-with-profiles", gameId],
    enabled: open,
    queryFn: async () => {
      const { data: gm } = await supabase.from("game_members").select("user_id, role").eq("game_id", gameId);
      const ids = (gm ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
      return (gm ?? []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        name: map.get(m.user_id) ?? "Trainer",
      }));
    },
  });

  const [editors, setEditors] = useState<string[]>([]);
  const [viewers, setViewers] = useState<string[]>([]);

  useEffect(() => {
    if (row) {
      setEditors(row.allowed_editors ?? []);
      setViewers(row.allowed_viewers ?? []);
    }
  }, [row]);

  function toggle(list: string[], setter: (v: string[]) => void, id: string) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  async function save() {
    // Encontra quem é o mestre/narrador na lista de membros da mesa
    const narratorMember = (members ?? []).find((m) => m.role === "narrator");
    const narratorId = narratorMember?.user_id;

    // Criamos conjuntos (Sets) para evitar duplicatas e garantir que Criador e Narrador
    // estejam SEMPRE inclusos tanto para Ver quanto para Editar.
    const finalViewersSet = new Set([...viewers]);
    const finalEditorsSet = new Set([...editors]);

    // O criador original (owner_id) sempre tem acesso total
    if (row?.owner_id) {
      finalViewersSet.add(row.owner_id);
      finalEditorsSet.add(row.owner_id);
    }

    // O Narrador é tratado como criador, logo também ganha acesso total e perpétuo
    if (narratorId) {
      finalViewersSet.add(narratorId);
      finalEditorsSet.add(narratorId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = kind === "pokemon" ? supabase.from("pokemon") : supabase.from("trainers");
    const { error } = await q
      .update({
        allowed_editors: Array.from(finalEditorsSet),
        allowed_viewers: Array.from(finalViewersSet),
      })
      .eq("id", entityId);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Permissões salvas");
    qc.invalidateQueries({ queryKey: [table, entityId] });
    qc.invalidateQueries({ queryKey: [table, entityId, "perms"] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Permissões da ficha">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Permissões da ficha</DialogTitle>
        </DialogHeader>
        {!isNarrator && (
          <p className="text-xs text-muted-foreground">Apenas o mestre pode editar essas configurações.</p>
        )}
        <p className="text-xs text-muted-foreground">
          O criador da ficha e o mestre sempre possuem acesso total. A ficha somente aparecerá na lista de arquivos de
          outros jogadores caso o mestre ative explicitamente a permissão "Ver" para eles.
        </p>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Membro</div>
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Ver</div>
          <div className="text-[10px] font-bold uppercase text-muted-foreground">Editar</div>
          {(members ?? []).map((m) => {
            const isOwner = m.user_id === row?.owner_id;
            const isNar = m.role === "narrator";

            // Força o visual do checkbox a ficar marcado para donos e narradores
            const isCheckedView = isOwner || isNar || viewers.includes(m.user_id);
            const isCheckedEdit = isOwner || isNar || editors.includes(m.user_id);

            return (
              <div key={m.user_id} className="contents">
                <div className="truncate">
                  {m.name}
                  {isOwner && <span className="ml-1 text-[10px] text-muted-foreground">(dono)</span>}
                  {isNar && <span className="ml-1 text-[10px] text-amber-500">(mestre)</span>}
                </div>
                <Checkbox
                  checked={isCheckedView}
                  disabled={!isNarrator || isOwner || isNar}
                  onCheckedChange={() => toggle(viewers, setViewers, m.user_id)}
                />
                <Checkbox
                  checked={isCheckedEdit}
                  disabled={!isNarrator || isOwner || isNar}
                  onCheckedChange={() => toggle(editors, setEditors, m.user_id)}
                />
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
          {isNarrator && <Button onClick={save}>Salvar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
