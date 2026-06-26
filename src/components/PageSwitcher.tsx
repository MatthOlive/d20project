import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, Eye, Radio, Plus, Pencil, Trash2, Users } from "lucide-react";

type Scenario = { id: string; name: string; background_url: string | null; darkness_level?: number };
type Member = { user_id: string; display_name: string | null; role: string; viewing_page_id: string | null };

/**
 * Page switcher for the tactical map (narrator only).
 * - "Visualizar" changes only the local viewing page for the narrator.
 * - "Tornar ativa" updates games.active_page_id (broadcast to ALL players).
 * - "Mover jogadores" opens a per-player picker to route selected players to
 *   this scenario (writes game_members.viewing_page_id as an override).
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
  const [moveTarget, setMoveTarget] = useState<Scenario | null>(null);

  const { data: scenarios = [] } = useQuery<Scenario[]>({
    queryKey: ["scenarios", gameId],
    queryFn: async () => {
      const { data } = await supabase
        .from("scenarios")
        .select("id,name,background_url,darkness_level")
        .eq("game_id", gameId)
        .order("created_at");
      return (data ?? []) as Scenario[];
    },
  });

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["game-members-view", gameId],
    enabled: isNarrator && !!moveTarget,
    queryFn: async () => {
      const { data } = await supabase
        .from("game_members")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("user_id,display_name,role,viewing_page_id" as any)
        .eq("game_id", gameId);
      return ((data ?? []) as unknown) as Member[];
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

  async function setDarkness(s: Scenario, value: number) {
    const v = Math.max(0, Math.min(1, value));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("scenarios") as any).update({ darkness_level: v }).eq("id", s.id);
    qc.invalidateQueries({ queryKey: ["scenarios", gameId] });
    qc.invalidateQueries({ queryKey: ["scenario-meta", s.id] });
  }

  async function moveSelectedPlayers(target: Scenario, userIds: string[], clear: boolean) {
    if (userIds.length === 0) { toast.error("Selecione ao menos 1 jogador"); return; }
    const newValue = clear ? null : target.id;
    const { error } = await supabase
      .from("game_members")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ viewing_page_id: newValue } as any)
      .eq("game_id", gameId)
      .in("user_id", userIds);
    if (error) { toast.error(error.message); return; }
    toast.success(clear
      ? `Removidos overrides de ${userIds.length} jogador(es)`
      : `${userIds.length} jogador(es) movidos para "${target.name}"`);
    qc.invalidateQueries({ queryKey: ["game-members-view", gameId] });
    setMoveTarget(null);
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
          className="mt-1 w-80 rounded-lg border border-border bg-card/95 p-1 shadow-xl backdrop-blur"
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
                      title="Tornar ativa para TODOS os jogadores"
                    >
                      <Radio className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMoveTarget(s)}
                    className="rounded p-1 text-amber-500 opacity-0 hover:bg-background group-hover:opacity-100"
                    title="Mover jogadores selecionados para esta página"
                  >
                    <Users className="h-3 w-3" />
                  </button>
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
          {(() => {
            const cur = scenarios.find((s) => s.id === viewingPageId);
            if (!cur) return null;
            const lvl = Math.round((cur.darkness_level ?? 0) * 100);
            return (
              <div className="mt-2 rounded-md border border-border bg-background px-2 py-1.5">
                <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                  <span>Escuridão da cena</span>
                  <span className="text-foreground">{lvl}%</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5} value={lvl}
                  onChange={(e) => setDarkness(cur, Number(e.target.value) / 100)}
                  className="mt-1 w-full"
                />
              </div>
            );
          })()}
          <button
            type="button"
            onClick={createPage}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> Nova página
          </button>
        </div>
      )}

      {moveTarget && (
        <MovePlayersDialog
          target={moveTarget}
          members={members}
          activePageId={activePageId}
          onClose={() => setMoveTarget(null)}
          onMove={(ids, clear) => moveSelectedPlayers(moveTarget, ids, clear)}
        />
      )}
    </div>
  );
}

function MovePlayersDialog({
  target,
  members,
  activePageId,
  onClose,
  onMove,
}: {
  target: Scenario;
  members: Member[];
  activePageId: string | null;
  onClose: () => void;
  onMove: (userIds: string[], clear: boolean) => void;
}) {
  const players = members.filter((m) => m.role !== "narrator");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-card p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold">Mover jogadores para “{target.name}”</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Os jogadores selecionados verão esta página, independente da página ativa.
          Use “Limpar override” para voltar a seguir a página ativa global.
        </p>
        <div className="mt-2 flex justify-between text-[11px]">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setSelected(new Set(players.map((p) => p.user_id)))}
          >
            Selecionar todos
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() => setSelected(new Set())}
          >
            Limpar
          </button>
        </div>
        <div className="mt-2 max-h-60 overflow-auto rounded border border-border">
          {players.length === 0 && (
            <p className="p-3 text-center text-xs text-muted-foreground">Nenhum jogador na mesa.</p>
          )}
          {players.map((p) => {
            const effective = p.viewing_page_id ?? activePageId;
            const isOnTarget = effective === target.id;
            return (
              <label
                key={p.user_id}
                className="flex cursor-pointer items-center gap-2 border-b border-border/40 px-2 py-1.5 text-xs last:border-b-0 hover:bg-accent/40"
              >
                <input
                  type="checkbox"
                  checked={selected.has(p.user_id)}
                  onChange={() => toggle(p.user_id)}
                />
                <span className="flex-1 truncate">{p.display_name ?? p.user_id.slice(0, 8)}</span>
                {p.viewing_page_id && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-500">
                    Override
                  </span>
                )}
                {isOnTarget && (
                  <span className="text-[10px] text-emerald-500">já está aqui</span>
                )}
              </label>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onMove([...selected], true)}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-accent"
            title="Remove o override e faz os selecionados seguirem a página ativa"
          >
            Limpar override
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onMove([...selected], false)}
            className="rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:opacity-90"
          >
            Mover
          </button>
        </div>
      </div>
    </div>
  );
}
