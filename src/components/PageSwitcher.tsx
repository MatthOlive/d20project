import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, Eye, Radio, Plus, Pencil, Trash2 } from "lucide-react";

type Scenario = { id: string; name: string; background_url: string | null };

/**
 * Page switcher for the tactical map (narrator only).
 * - "Visualizar" changes only the local viewing page for the narrator.
 * - "Tornar ativa" updates games.active_page_id (broadcast to players via realtime).
 */
export function PageSwitcher({
  gameId,
  viewingPageId,
  activePageId,
  isNarrator,
  onView,
}: {
  gameId: string;
  viewingPageId: string | null;
  activePageId: string | null;
  isNarrator: boolean;
  onView: (pageId: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: scenarios = [] } = useQuery<Scenario[]>({
    queryKey: ["scenarios", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("scenarios")
        .select("id,name,background_url")
        .eq("game_id", gameId)
        .order("created_at");
      return (data ?? []) as Scenario[];
    },
  });

  const current = scenarios.find((s) => s.id === viewingPageId) ?? scenarios[0];

  async function setActive(pageId: string) {
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("games").update({ active_page_id: pageId } as any).eq("id", gameId);
    if (error) toast.error(error.message);
    else {
      toast.success("Página ativa atualizada para os jogadores");
      qc.invalidateQueries({ queryKey: ["game", gameId] });
    }
  }

  async function createPage() {
    const name = prompt("Nome da nova página")?.trim();
    if (!name) return;
    const { data, error } = await supabase
      .from("scenarios")
      .insert({ game_id: gameId, name })
      .select("id")
      .single();
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["scenarios", gameId] });
    if (data?.id) onView(data.id);
  }

  async function renamePage(s: Scenario) {
    const name = prompt("Renomear página", s.name)?.trim();
    if (!name) return;
    await supabase.from("scenarios").update({ name }).eq("id", s.id);
    qc.invalidateQueries({ queryKey: ["scenarios", gameId] });
  }

  async function deletePage(s: Scenario) {
    if (scenarios.length <= 1) { toast.error("Não é possível excluir a única página"); return; }
    if (!confirm(`Excluir a página "${s.name}" e tudo nela (tokens, desenhos, fog, paredes, backgrounds)?`)) return;
    await supabase.from("scenarios").delete().eq("id", s.id);
    qc.invalidateQueries({ queryKey: ["scenarios", gameId] });
    if (viewingPageId === s.id) {
      const fallback = scenarios.find((x) => x.id !== s.id);
      if (fallback) onView(fallback.id);
    }
  }

  if (!isNarrator) return null;

  return (
    <div data-map-toolbar className="pointer-events-auto absolute left-3 top-3 z-30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 text-xs font-semibold shadow-lg backdrop-blur hover:bg-accent"
        title="Trocar de página"
      >
        <span className="opacity-60">Página:</span>
        <span className="truncate max-w-[180px]">{current?.name ?? "—"}</span>
        {viewingPageId && viewingPageId === activePageId && (
          <Radio className="h-3 w-3 text-emerald-500" aria-label="Ativa para jogadores" />
        )}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className="mt-1 w-72 rounded-lg border border-border bg-card/95 p-1 shadow-xl backdrop-blur"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="max-h-80 overflow-auto">
            {scenarios.map((s) => {
              const isViewing = viewingPageId === s.id;
              const isActive = activePageId === s.id;
              return (
                <div
                  key={s.id}
                  className={`group flex items-center gap-1 rounded-md px-1.5 py-1 ${isViewing ? "bg-accent" : "hover:bg-accent/60"}`}
                >
                  <button
                    type="button"
                    onClick={() => { onView(s.id); setOpen(false); }}
                    className="flex flex-1 items-center gap-1.5 truncate text-left text-[12px]"
                    title="Visualizar esta página (só você)"
                  >
                    <Eye className={`h-3 w-3 ${isViewing ? "text-primary" : "opacity-40"}`} />
                    <span className="truncate">{s.name}</span>
                    {isActive && <Radio className="h-3 w-3 shrink-0 text-emerald-500" aria-label="Ativa" />}
                  </button>
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => setActive(s.id)}
                      className="rounded p-1 text-emerald-500 opacity-0 hover:bg-background group-hover:opacity-100"
                      title="Tornar ativa para os jogadores"
                    >
                      <Radio className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => renamePage(s)}
                    className="rounded p-1 opacity-0 hover:bg-background group-hover:opacity-100"
                    title="Renomear"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePage(s)}
                    className="rounded p-1 text-destructive opacity-0 hover:bg-background group-hover:opacity-100"
                    title="Excluir página"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={createPage}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Nova página
          </button>
        </div>
      )}
    </div>
  );
}
