import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TrainerSheet } from "@/components/TrainerSheet";
import { ImageSourceDialog } from "@/components/ImageSourceDialog";
import { PokemonSheet } from "@/components/PokemonSheet";
import { Shop } from "@/components/Shop";
import { CHARACTER_POINTER_DROP_EVENT, DRAG_MIME, type DragCharacterPayload } from "@/components/MapBoard";
import { User, Boxes, Plus, ShoppingCart, FileText, ArrowUpFromLine, Flag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const TRAINER_SHEET_POINTER_DROP_EVENT = "d20-trainer-sheet-pointer-drop";

type SlotPokemon = {
  id: string;
  nickname: string | null;
  team_slot: number | null;
  image_url: string | null;
  species_id: string;
  marked: boolean;
};

type Tab =
  | { kind: "trainer" }
  | { kind: "slot"; slot: number; pokemonId: string | null }
  | { kind: "pc" }
  | { kind: "pcPokemon"; pokemonId: string }
  | { kind: "shop" };

const SLOTS = [1, 2, 3, 4, 5, 6] as const;

export function SheetTabs(props: {
  trainerId: string;
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onRoll: (label: string, n: number, penalty?: number, meta?: { characterKind: "trainer" | "pokemon"; characterId: string; imageUrl?: string | null }) => void;
  onChat: (body: string) => void;
  onDeleted?: () => void;
}) {
  const { trainerId, gameId, userId, isNarrator } = props;
  const qc = useQueryClient();
  const [active, setActive] = useState<Tab>({ kind: "trainer" });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const teamPointerDragRef = useRef<{
    id: string;
    label: string;
    fromSlot: number;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const suppressTeamClickRef = useRef(false);
  const [teamDragPreview, setTeamDragPreview] = useState<{ label: string; x: number; y: number } | null>(null);

  // Detect minimal sheet (just image + description)
  const { data: trainerMeta } = useQuery({
    queryKey: ["trainer-meta", trainerId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("trainers") as any)
        .select("is_minimal, name, image_url, description, owner_id, allowed_editors")
        .eq("id", trainerId).single();
      if (error) throw error;
      return data as { is_minimal: boolean; name: string; image_url: string | null; description: string | null; owner_id: string; allowed_editors: string[] | null };
    },
  });

  // Pokemon owned by this trainer (team + PC)
  const { data: roster = [] } = useQuery({
    queryKey: ["trainer-roster", trainerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon")
        .select("id, nickname, team_slot, image_url, species_id, marked")
        .eq("owner_trainer_id", trainerId);
      if (error) throw error;
      return (data ?? []) as SlotPokemon[];
    },
    enabled: !trainerMeta?.is_minimal,
  });

  // Species sprite map (for fallback)
  const speciesIds = useMemo(() => roster.map((p) => p.species_id).filter(Boolean), [roster]);
  const { data: spriteMap = {} } = useQuery({
    queryKey: ["trainer-roster-sprites", trainerId, speciesIds.join(",")],
    queryFn: async () => {
      if (speciesIds.length === 0) return {};
      const { data, error } = await supabase
        .from("species")
        .select("id, sprite_url, name")
        .in("id", speciesIds);
      if (error) throw error;
      const map: Record<string, { sprite_url: string | null; name: string }> = {};
      (data ?? []).forEach((s) => { map[s.id] = { sprite_url: s.sprite_url, name: s.name }; });
      return map;
    },
    enabled: speciesIds.length > 0,
  });

  const team = SLOTS.map((slot) => ({
    slot,
    pokemon: roster.find((p) => p.team_slot === slot) ?? null,
  }));
  const pcPokemon = roster.filter((p) => p.team_slot === null);

  function spriteFor(p: SlotPokemon | null): string | null {
    if (!p) return null;
    return p.image_url || spriteMap[p.species_id]?.sprite_url || null;
  }
  function nameFor(p: SlotPokemon | null): string {
    if (!p) return "";
    return p.nickname || spriteMap[p.species_id]?.name || "Pokémon";
  }

  function invalidateRoster() {
    qc.invalidateQueries({ queryKey: ["trainer-roster", trainerId] });
    qc.invalidateQueries({ queryKey: ["characters", gameId] });
  }

  function nextFreeTeamSlot(exceptPokemonId?: string): number | null {
    const usedSlots = new Set(
      roster
        .filter((r) => r.id !== exceptPokemonId && r.team_slot != null)
        .map((r) => r.team_slot!),
    );
    return SLOTS.find((slot) => !usedSlots.has(slot)) ?? null;
  }

  async function assignPokemonToTrainer(pokemonId: string, teamSlot: number | null) {
    const { error } = await (supabase.rpc("assign_pokemon_to_trainer" as never, {
      p_pokemon_id: pokemonId,
      p_trainer_id: trainerId,
      p_team_slot: teamSlot,
    } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (!error) return;

    const fallback = await supabase.from("pokemon")
      .update({ owner_trainer_id: trainerId, team_slot: teamSlot })
      .eq("id", pokemonId);
    if (fallback.error) throw new Error(`${error.message}. ${fallback.error.message}`);
  }

  async function movePokemonToTrainer(
    pokemonId: string,
    label: string,
    target: { kind: "pc" } | { kind: "slot"; slot: number } | { kind: "auto" },
    sourceSlot?: number,
  ) {
    if (target.kind === "slot" && sourceSlot === target.slot) return;

    const teamSlot =
      target.kind === "pc" ? null :
      target.kind === "slot" ? target.slot :
      nextFreeTeamSlot(pokemonId);

    if (target.kind === "slot") {
      const occupied = roster.find((r) => r.id !== pokemonId && r.team_slot === target.slot);
      if (occupied) {
        if (sourceSlot != null && sourceSlot !== target.slot) {
          await assignPokemonToTrainer(pokemonId, null);
          await assignPokemonToTrainer(occupied.id, sourceSlot);
        } else {
          await assignPokemonToTrainer(occupied.id, null);
        }
      }
    }

    await assignPokemonToTrainer(pokemonId, teamSlot);
    await registerInPokedex(pokemonId);
    invalidateRoster();

    if (teamSlot == null) {
      setActive({ kind: "pc" });
      toast.success(`${label} guardado no PC`);
    } else {
      setActive({ kind: "slot", slot: teamSlot, pokemonId });
      toast.success(`${label} adicionado ao slot ${teamSlot}`);
    }
  }

  function targetFromPoint(clientX: number, clientY: number): { kind: "pc" } | { kind: "slot"; slot: number } | { kind: "auto" } | null {
    const elements = document.elementsFromPoint(clientX, clientY);
    const pcHit = elements.some((el) =>
      el instanceof HTMLElement && !!el.closest('[data-pokemon-pc-drop-target="true"]')
    );
    if (pcHit) return { kind: "pc" };

    const slotTarget = elements
      .map((el) => el instanceof HTMLElement ? el.closest<HTMLElement>("[data-pokemon-slot-drop-target]") : null)
      .find(Boolean);
    const slot = Number(slotTarget?.dataset.pokemonSlotDropTarget);
    if (Number.isInteger(slot) && SLOTS.includes(slot as (typeof SLOTS)[number])) {
      return { kind: "slot", slot };
    }

    const sheetHit = elements.some((el) =>
      el instanceof HTMLElement && !!el.closest('[data-trainer-sheet-drop-target="true"]')
    );
    if (!sheetHit) return null;
    if (active.kind === "slot") return { kind: "slot", slot: active.slot };
    return active.kind === "pc" || active.kind === "pcPokemon" ? { kind: "pc" } : { kind: "auto" };
  }

  async function movePayloadToTarget(
    payload: DragCharacterPayload | { id: string; label: string; fromSlot?: number },
    target: { kind: "pc" } | { kind: "slot"; slot: number } | { kind: "auto" },
  ) {
    if ("kind" in payload && payload.kind !== "pokemon") {
      toast.error("Apenas Pokemon podem entrar no time/PC.");
      return;
    }
    await movePokemonToTrainer(payload.id, payload.label, target, "fromSlot" in payload ? payload.fromSlot : undefined);
  }

  // Auto-register a pokemon (and its species) in this trainer's Pokédex as captured.
  async function registerInPokedex(pokemonId: string) {
    const { data: pkm } = await supabase
      .from("pokemon")
      .select("species_id, nickname, species:species_id(name, sprite_url)")
      .eq("id", pokemonId)
      .single<{ species_id: string; nickname: string | null; species: { name: string; sprite_url: string | null } | null }>();
    if (!pkm?.species_id) return;
    const { data: t } = await supabase
      .from("trainers")
      .select("pokedex")
      .eq("id", trainerId)
      .single<{ pokedex: Record<string, { name: string; captured: boolean; sprite_url?: string | null }> }>();
    const dex = { ...(t?.pokedex ?? {}) };
    dex[pkm.species_id] = {
      name: pkm.species?.name ?? pkm.nickname ?? "Pokémon",
      captured: true,
      sprite_url: pkm.species?.sprite_url ?? null,
    };
    await supabase.from("trainers").update({ pokedex: dex }).eq("id", trainerId);
    qc.invalidateQueries({ queryKey: ["trainer", trainerId] });
  }

  async function handleSheetDrop(e: React.DragEvent<HTMLDivElement>) {
    const target = targetFromPoint(e.clientX, e.clientY)
      ?? (active.kind === "pc" || active.kind === "pcPokemon" ? { kind: "pc" as const } : { kind: "auto" as const });
    const slotRaw = e.dataTransfer.getData(SLOT_DRAG_MIME);
    const characterRaw = e.dataTransfer.getData(DRAG_MIME);
    if (!slotRaw && !characterRaw) return;
    e.preventDefault();
    e.stopPropagation();

    try {
      if (slotRaw) {
        await movePayloadToTarget(JSON.parse(slotRaw) as { id: string; label: string; fromSlot?: number }, target);
        return;
      }
      await movePayloadToTarget(JSON.parse(characterRaw) as DragCharacterPayload, target);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel mover este Pokemon.");
    }
  }

  function handleSheetDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.types.includes(DRAG_MIME) || e.dataTransfer.types.includes(SLOT_DRAG_MIME)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
    }
  }

  function beginTeamPointerDrag(e: React.PointerEvent, pokemon: SlotPokemon, fromSlot: number) {
    if (e.button !== 0) return;
    teamPointerDragRef.current = {
      id: pokemon.id,
      label: nameFor(pokemon),
      fromSlot,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  }

  useEffect(() => {
    function handlePointerDrop(e: Event) {
      const detail = (e as CustomEvent).detail as { payload?: DragCharacterPayload; clientX?: number; clientY?: number } | undefined;
      if (!detail?.payload || typeof detail.clientX !== "number" || typeof detail.clientY !== "number") return;
      const target = targetFromPoint(detail.clientX, detail.clientY);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      if (detail.payload.kind !== "pokemon") {
        toast.error("Apenas Pokemon podem entrar no time/PC.");
        return;
      }
      void (async () => {
        try {
          await movePayloadToTarget(detail.payload!, target);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Nao foi possivel mover este Pokemon.");
        }
      })();
    }

    const root = rootRef.current;
    root?.addEventListener(TRAINER_SHEET_POINTER_DROP_EVENT, handlePointerDrop);
    window.addEventListener(CHARACTER_POINTER_DROP_EVENT, handlePointerDrop, { capture: true });
    return () => {
      root?.removeEventListener(TRAINER_SHEET_POINTER_DROP_EVENT, handlePointerDrop);
      window.removeEventListener(CHARACTER_POINTER_DROP_EVENT, handlePointerDrop, { capture: true });
    };
  }, [active, roster, trainerId]);

  useEffect(() => {
    function move(e: PointerEvent) {
      const drag = teamPointerDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const distance = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (!drag.active && distance > 6) drag.active = true;
      if (!drag.active) return;
      e.preventDefault();
      setTeamDragPreview({ label: drag.label, x: e.clientX, y: e.clientY });
    }

    function up(e: PointerEvent) {
      const drag = teamPointerDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      teamPointerDragRef.current = null;
      setTeamDragPreview(null);
      if (!drag.active) return;
      e.preventDefault();
      suppressTeamClickRef.current = true;
      const target = targetFromPoint(e.clientX, e.clientY);
      if (!target) return;
      void movePayloadToTarget({ id: drag.id, label: drag.label, fromSlot: drag.fromSlot }, target);
    }

    function cancel(e: PointerEvent) {
      const drag = teamPointerDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      teamPointerDragRef.current = null;
      setTeamDragPreview(null);
    }

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up, { passive: false });
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [active, roster, trainerId]);

  if (trainerMeta?.is_minimal) {
    const canEdit = isNarrator || trainerMeta.owner_id === userId || (trainerMeta.allowed_editors ?? []).includes(userId);
    return <MinimalSheetView trainerId={trainerId} meta={trainerMeta} canEdit={canEdit} onDeleted={props.onDeleted} />;
  }

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 w-full"
      data-trainer-sheet-drop-target="true"
      onDragOver={handleSheetDragOver}
      onDrop={handleSheetDrop}
    >
      {/* Vertical tab rail */}
      <div className="flex w-14 shrink-0 flex-col gap-1 border-r border-border bg-muted/40 p-1.5">
        <TabButton
          active={active.kind === "trainer"}
          onClick={() => setActive({ kind: "trainer" })}
          tone="primary"
          title="Trainer"
        >
          <User className="h-4 w-4" />
        </TabButton>
        {team.map(({ slot, pokemon }) => {
          const isActive = active.kind === "slot" && active.slot === slot;
          const sprite = spriteFor(pokemon);
          return (
            <TabButton
              key={slot}
              active={isActive}
              onClick={() => {
                if (suppressTeamClickRef.current) {
                  suppressTeamClickRef.current = false;
                  return;
                }
                setActive({ kind: "slot", slot, pokemonId: pokemon?.id ?? null });
              }}
              title={pokemon ? `${nameFor(pokemon)} — arraste para o PC para guardar, ou para outro slot para trocar` : `Slot ${slot}`}
              tone={pokemon ? "team" : "empty"}
              slotTarget={slot}
              onPointerDown={pokemon ? (e) => beginTeamPointerDrag(e, pokemon, slot) : undefined}
              draggable={!!pokemon}
              onDragStart={pokemon ? (e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(SLOT_DRAG_MIME, JSON.stringify({ id: pokemon.id, label: nameFor(pokemon), fromSlot: slot }));
              } : undefined}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(SLOT_DRAG_MIME) || e.dataTransfer.types.includes(DRAG_MIME)) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={async (e) => {
                const raw = e.dataTransfer.getData(SLOT_DRAG_MIME);
                const characterRaw = e.dataTransfer.getData(DRAG_MIME);
                if (!raw && !characterRaw) return;
                e.preventDefault();
                e.stopPropagation();
                try {
                  if (characterRaw) {
                    await movePayloadToTarget(JSON.parse(characterRaw) as DragCharacterPayload, { kind: "slot", slot });
                    return;
                  }
                  const p = JSON.parse(raw) as { id: string; label: string; fromSlot?: number };
                  if (p.fromSlot == null) {
                    await movePayloadToTarget(p, { kind: "slot", slot });
                    return;
                  }
                  if (p.fromSlot === slot) return;
                  const target = roster.find((r) => r.team_slot === slot);
                  // Temporarily park source in null to dodge unique-slot constraint
                  const upd1 = await supabase.from("pokemon").update({ team_slot: null }).eq("id", p.id);
                  if (upd1.error) { toast.error(upd1.error.message); return; }
                  if (target) {
                    const upd2 = await supabase.from("pokemon").update({ team_slot: p.fromSlot }).eq("id", target.id);
                    if (upd2.error) { toast.error(upd2.error.message); return; }
                  }
                  const upd3 = await supabase.from("pokemon").update({ team_slot: slot }).eq("id", p.id);
                  if (upd3.error) { toast.error(upd3.error.message); return; }
                  toast.success(`Slot ${p.fromSlot} ⇄ ${slot}`);
                  invalidateRoster();
                  setActive({ kind: "slot", slot, pokemonId: p.id });
                } catch { /* ignore */ }
              }}
            >
              {sprite
                ? <img src={sprite} alt={nameFor(pokemon)} className="h-7 w-7 object-contain" />
                : <span className="text-[10px] font-bold text-muted-foreground">{slot}</span>}
            </TabButton>
          );
        })}
        <TabButton
          active={active.kind === "pc" || active.kind === "pcPokemon"}
          onClick={() => setActive({ kind: "pc" })}
          tone="pc"
          dropTarget
          title="PC (Box) — arraste um Pokémon dos Files ou do seu time aqui para guardar"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_MIME) || e.dataTransfer.types.includes(SLOT_DRAG_MIME)) {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
            }
          }}
          onDrop={async (e) => {
            // From team slot → PC
            const slotRaw = e.dataTransfer.getData(SLOT_DRAG_MIME);
            if (slotRaw) {
              e.preventDefault();
              e.stopPropagation();
              try {
                const p = JSON.parse(slotRaw) as { id: string; label: string };
                await assignPokemonToTrainer(p.id, null);
                toast.success(`${p.label} movido para o PC`);
                invalidateRoster();
                setActive({ kind: "pc" });
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Nao foi possivel mover para o PC.");
              }
              return;
            }
            // From map/files → PC
            const raw = e.dataTransfer.getData(DRAG_MIME);
            if (!raw) return;
            e.preventDefault();
            e.stopPropagation();
            try {
              const p = JSON.parse(raw) as DragCharacterPayload;
              if (p.kind !== "pokemon") { toast.error("Apenas Pokémon podem ir para o PC."); return; }
              await assignPokemonToTrainer(p.id, null);
              await registerInPokedex(p.id);
              toast.success(`${p.label} guardado no PC`);
              invalidateRoster();
              setActive({ kind: "pc" });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Nao foi possivel guardar no PC.");
            }
          }}
        >
          <Boxes className="h-4 w-4" />
        </TabButton>
        <TabButton
          active={active.kind === "shop"}
          onClick={() => setActive({ kind: "shop" })}
          tone="primary"
          title="Pokémart"
        >
          <ShoppingCart className="h-4 w-4" />
        </TabButton>
      </div>

      {/* Active panel */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {active.kind === "trainer" && (
          <TrainerSheet
            trainerId={trainerId}
            userId={userId}
            isNarrator={isNarrator}
            onRoll={props.onRoll}
            onDeleted={props.onDeleted}
          />
        )}
        {active.kind === "slot" && (
          active.pokemonId
            ? <PokemonSheet
                pokemonId={active.pokemonId}
                gameId={gameId}
                userId={userId}
                isNarrator={isNarrator}
                onRoll={props.onRoll}
                onChat={props.onChat}
                onDeleted={invalidateRoster}
              />
            : <EmptySlot
                slot={active.slot}
                gameId={gameId}
                trainerId={trainerId}
                userId={userId}
                canEdit={isNarrator || true}
                spriteMap={spriteMap}
                onAssigned={(pid) => {
                  invalidateRoster();
                  setActive({ kind: "slot", slot: active.slot, pokemonId: pid });
                }}
              />
        )}
        {active.kind === "pc" && (
          <PcGrid
            pokemon={pcPokemon}
            sprite={(p) => spriteFor(p)}
            name={(p) => nameFor(p)}
            onOpen={(pid) => setActive({ kind: "pcPokemon", pokemonId: pid })}
            onAddToTeam={async (pid) => {
              const usedSlots = new Set(roster.filter((r) => r.team_slot != null).map((r) => r.team_slot!));
              const nextSlot = SLOTS.find((s) => !usedSlots.has(s));
              if (!nextSlot) { toast.error("Equipe cheia (6 Pokémon)."); return; }
              try {
                await assignPokemonToTrainer(pid, nextSlot);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Nao foi possivel adicionar ao time.");
                return;
              }
              toast.success(`Adicionado ao slot ${nextSlot}`);
              invalidateRoster();
              setActive({ kind: "slot", slot: nextSlot, pokemonId: pid });
            }}
            onRelease={async (pid) => {
              const { error } = await supabase.from("pokemon").delete().eq("id", pid);
              if (error) { toast.error(error.message); return; }
              toast.success("Pokémon liberado");
              invalidateRoster();
            }}
            onToggleMark={async (pid, marked) => {
              const { error } = await supabase.from("pokemon").update({ marked: !marked }).eq("id", pid);
              if (error) { toast.error(error.message); return; }
              invalidateRoster();
            }}
          />
        )}
        {active.kind === "pcPokemon" && (
          <div className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
              <Button size="sm" variant="ghost" onClick={() => setActive({ kind: "pc" })}>← PC</Button>
            </div>
            <PokemonSheet
              pokemonId={active.pokemonId}
              gameId={gameId}
              userId={userId}
              isNarrator={isNarrator}
              onRoll={props.onRoll}
              onChat={props.onChat}
              onDeleted={invalidateRoster}
            />
          </div>
        )}
        {active.kind === "shop" && (
          <Shop trainerId={trainerId} />
        )}
      </div>
      {teamDragPreview && (
        <div
          className="pointer-events-none fixed z-[9999] max-w-48 rounded-md border border-primary bg-popover px-3 py-2 text-sm font-semibold text-popover-foreground shadow-xl"
          style={{ left: teamDragPreview.x + 12, top: teamDragPreview.y + 12 }}
        >
          {teamDragPreview.label}
        </div>
      )}
    </div>
  );
}

const SLOT_DRAG_MIME = "application/x-pokerole-slot-move+json";

function TabButton({
  active, onClick, children, title, tone, onDragOver, onDrop, draggable, onDragStart, onPointerDown, dropTarget, slotTarget,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  tone: "primary" | "team" | "empty" | "pc";
  onDragOver?: React.DragEventHandler<HTMLButtonElement>;
  onDrop?: React.DragEventHandler<HTMLButtonElement>;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLButtonElement>;
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
  dropTarget?: boolean;
  slotTarget?: number;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      draggable={draggable}
      onDragStart={onDragStart}
      onPointerDown={onPointerDown}
      data-pokemon-pc-drop-target={dropTarget ? "true" : undefined}
      data-pokemon-slot-drop-target={slotTarget}
      style={onPointerDown ? { touchAction: "none" } : undefined}
      className={cn(
        "flex h-11 w-full items-center justify-center rounded-md border transition",
        active
          ? "border-primary bg-primary/15 ring-1 ring-primary"
          : "border-border bg-card hover:bg-accent",
        tone === "primary" && !active && "border-l-2 border-l-primary/60",
        tone === "pc" && !active && "border-l-2 border-l-success/60",
      )}
    >
      {children}
    </button>
  );
}

function EmptySlot({
  slot, gameId, trainerId, spriteMap, onAssigned,
}: {
  slot: number;
  gameId: string;
  trainerId: string;
  userId: string;
  canEdit: boolean;
  spriteMap: Record<string, { sprite_url: string | null; name: string }>;
  onAssigned: (pokemonId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Pokemon in this game that aren't already in *this* trainer's team
  const { data: candidates = [] } = useQuery({
    queryKey: ["assignable-pokemon", gameId, trainerId, open],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon")
        .select("id, nickname, image_url, species_id, owner_trainer_id, team_slot")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Exclude pokemon currently in this trainer's active team slot
      return (data ?? []).filter((p) =>
        !(p.owner_trainer_id === trainerId && p.team_slot !== null)
      );
    },
    enabled: open,
  });

  // Fetch names/sprites for every candidate species (spriteMap only covers this trainer's roster)
  const candidateSpeciesIds = useMemo(
    () => Array.from(new Set(candidates.map((p) => p.species_id).filter(Boolean))),
    [candidates],
  );
  const { data: candidateSpeciesMap = {} } = useQuery({
    queryKey: ["candidate-species", candidateSpeciesIds.join(",")],
    enabled: open && candidateSpeciesIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("species")
        .select("id, sprite_url, name")
        .in("id", candidateSpeciesIds);
      if (error) throw error;
      const m: Record<string, { sprite_url: string | null; name: string }> = {};
      (data ?? []).forEach((s) => { m[s.id] = { sprite_url: s.sprite_url, name: s.name }; });
      return m;
    },
  });
  const speciesLookup = useMemo(
    () => ({ ...spriteMap, ...candidateSpeciesMap }),
    [spriteMap, candidateSpeciesMap],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates.filter((p) => {
      if (!q) return true;
      const nm = p.nickname?.toLowerCase() ?? "";
      const sp = speciesLookup[p.species_id]?.name?.toLowerCase() ?? "";
      return nm.includes(q) || sp.includes(q);
    });
  }, [candidates, search, speciesLookup]);

  async function assign(pokemonId: string) {
    // Clear any previous slot for this pokemon, then assign new slot+owner
    const { error } = await supabase
      .from("pokemon")
      .update({ owner_trainer_id: trainerId, team_slot: slot })
      .eq("id", pokemonId);
    if (error) { toast.error(error.message); return; }
    toast.success("Added to team");
    setOpen(false);
    onAssigned(pokemonId);
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-lg border border-dashed border-border bg-card p-6 text-center">
        <p className="mb-1 text-sm font-bold">Slot {slot} vazio</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Atribua um Pokémon dos arquivos do jogo a este slot.
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar de Files
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-hidden">
          <DialogHeader><DialogTitle>Adicionar Pokémon ao Slot {slot}</DialogTitle></DialogHeader>
          <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {filtered.map((p) => {
              const sp = speciesLookup[p.species_id];
              const sprite = p.image_url || sp?.sprite_url;
              const nm = p.nickname || sp?.name || "Pokémon";
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => assign(p.id)}
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-left hover:bg-accent"
                >
                  {sprite
                    ? <img src={sprite} alt={nm} className="h-8 w-8 object-contain" />
                    : <div className="h-8 w-8 rounded bg-muted" />}
                  <span className="flex-1 text-sm">{nm}</span>
                  {p.owner_trainer_id === trainerId && p.team_slot === null && (
                    <span className="text-[10px] text-muted-foreground">(no PC)</span>
                  )}
                  {p.owner_trainer_id && p.owner_trainer_id !== trainerId && (
                    <span className="text-[10px] text-muted-foreground">(de outro treinador)</span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">Nenhum Pokémon disponível.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PcGrid({
  pokemon, sprite, name, onOpen, onAddToTeam, onRelease, onToggleMark,
}: {
  pokemon: SlotPokemon[];
  sprite: (p: SlotPokemon) => string | null;
  name: (p: SlotPokemon) => string;
  onOpen: (pokemonId: string) => void;
  onAddToTeam: (pokemonId: string) => void | Promise<void>;
  onRelease: (pokemonId: string) => void | Promise<void>;
  onToggleMark: (pokemonId: string, marked: boolean) => void | Promise<void>;
}) {
  const [releaseTarget, setReleaseTarget] = useState<SlotPokemon | null>(null);
  return (
    <div className="space-y-3 p-4" data-pokemon-pc-drop-target="true">
      <div className="flex items-center gap-2">
        <Boxes className="h-4 w-4 text-success" />
        <h3 className="text-sm font-bold">PC · Caixa de Pokémon</h3>
        <span className="ml-auto text-xs text-muted-foreground">{pokemon.length} guardado(s)</span>
      </div>
      {pokemon.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
          Sem Pokémon no PC. Pokémon capturados que não estão na equipe aparecerão aqui.
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {pokemon.map((p) => {
            const s = sprite(p);
            return (
              <DropdownMenu key={p.id}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title={name(p)}
                    className={cn(
                      "relative flex aspect-square flex-col items-center justify-center gap-1 rounded-md border bg-card p-1 hover:border-primary hover:bg-accent",
                      p.marked ? "border-amber-500 ring-1 ring-amber-500/60" : "border-border",
                    )}
                  >
                    {p.marked && (
                      <Flag className="absolute right-0.5 top-0.5 h-3 w-3 fill-amber-500 text-amber-500" />
                    )}
                    {s
                      ? <img src={s} alt={name(p)} className="h-12 w-12 object-contain" />
                      : <div className="h-12 w-12 rounded bg-muted" />}
                    <span className="line-clamp-1 text-[10px] font-medium">{name(p)}</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onClick={() => onAddToTeam(p.id)}>
                    <ArrowUpFromLine className="mr-2 h-4 w-4" /> Adicionar ao time
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onOpen(p.id)}>
                    <FileText className="mr-2 h-4 w-4" /> Ficha
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleMark(p.id, p.marked)}>
                    <Flag className="mr-2 h-4 w-4" /> {p.marked ? "Desmarcar" : "Marcar"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setReleaseTarget(p)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Liberar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!releaseTarget} onOpenChange={(o) => { if (!o) setReleaseTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar {releaseTarget ? name(releaseTarget) : "Pokémon"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (releaseTarget) await onRelease(releaseTarget.id);
                setReleaseTarget(null);
              }}
            >
              Liberar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MinimalSheetView({
  trainerId, meta, canEdit, onDeleted,
}: {
  trainerId: string;
  meta: { name: string; image_url: string | null; description: string | null };
  canEdit: boolean;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(meta.name);
  const [desc, setDesc] = useState(meta.description ?? "");
  const [confirmDel, setConfirmDel] = useState(false);
  async function patch(fields: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("trainers") as any).update(fields).eq("id", trainerId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["trainer-meta", trainerId] });
    qc.invalidateQueries({ queryKey: ["characters"] });
  }
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        {meta.image_url ? (
          <img src={meta.image_url} alt={meta.name} className="h-40 w-40 rounded-xl border border-border object-cover" />
        ) : (
          <div className="flex h-40 w-40 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-xs text-muted-foreground">Sem imagem</div>
        )}
        <div className="flex flex-1 flex-col gap-2">
          <Input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} onBlur={() => name !== meta.name && patch({ name })} className="text-lg font-bold" />
          {canEdit && (
            <MinimalImagePicker currentUrl={meta.image_url} onPick={(url) => patch({ image_url: url })} />
          )}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold">Descrição</label>
        <textarea
          value={desc}
          disabled={!canEdit}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== (meta.description ?? "") && patch({ description: desc })}
          rows={12}
          className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm"
          placeholder="Notas livres, descrição, anotações…"
        />
      </div>
      {canEdit && (
        <div className="flex justify-end">
          <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
            <Button size="sm" variant="destructive" onClick={() => setConfirmDel(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar ficha
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar esta ficha?</AlertDialogTitle>
                <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  await supabase.from("trainers").delete().eq("id", trainerId);
                  toast.success("Ficha apagada");
                  onDeleted?.();
                }}>Apagar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

function MinimalImagePicker({ currentUrl, onPick }: { currentUrl: string | null; onPick: (url: string | null) => void }) {
  // Lazy import to avoid circular issues in stricter bundlers; keep simple inline.
  
  return (
    <div className="flex gap-1.5">
      <ImageSourceDialog title="Imagem da ficha" onPick={(u: string) => onPick(u)} />
      {currentUrl && (
        <Button size="sm" variant="outline" onClick={() => onPick(null)}>Remover imagem</Button>
      )}
    </div>
  );
}
