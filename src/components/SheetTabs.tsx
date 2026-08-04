import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { User, Boxes, Plus, ShoppingCart, FileText, ArrowUpFromLine, Flag, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { preferredPokemonSprite } from "@/lib/pokerole";
import { useGameSpriteStyle } from "@/hooks/use-game-sprite-style";

export const TRAINER_SHEET_POINTER_DROP_EVENT = "d20-trainer-sheet-pointer-drop";

type SlotPokemon = {
  id: string;
  owner_id: string;
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

async function assignPokemonToTrainerRpc(pokemonId: string, trainerId: string, teamSlot: number | null) {
  const { error } = await (supabase.rpc("assign_pokemon_to_trainer" as never, {
    p_pokemon_id: pokemonId,
    p_trainer_id: trainerId,
    p_team_slot: teamSlot,
  } as never) as unknown as Promise<{ error: { message: string } | null }>);
  if (error) throw new Error(error.message);
}

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
  const spriteStyle = useGameSpriteStyle(gameId);
  const [active, setActive] = useState<Tab>({ kind: "trainer" });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const teamPointerDragRef = useRef<{
    payload: DragCharacterPayload;
    fromSlot?: number;
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
  const canEditRoster = !!trainerMeta && (
    isNarrator
    || trainerMeta.owner_id === userId
    || (trainerMeta.allowed_editors ?? []).includes(userId)
  );

  // Pokemon owned by this trainer (team + PC)
  const { data: roster = [] } = useQuery({
    queryKey: ["trainer-roster", trainerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon")
        .select("id, owner_id, nickname, team_slot, image_url, species_id, marked")
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

  useEffect(() => {
    let characterRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshCharacters = () => {
      if (characterRefreshTimer) clearTimeout(characterRefreshTimer);
      characterRefreshTimer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["characters", gameId] });
      }, 100);
    };
    const channel = supabase
      .channel(`trainer-roster:${gameId}:${trainerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pokemon", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const next = payload.new as Partial<SlotPokemon> & { id?: string; owner_trainer_id?: string | null };
          const previous = payload.old as Partial<SlotPokemon> & { id?: string; owner_trainer_id?: string | null };
          const pokemonId = next.id ?? previous.id;
          if (!pokemonId) return;

          qc.setQueryData<SlotPokemon[]>(["trainer-roster", trainerId], (current = []) => {
            const existing = current.find((entry) => entry.id === pokemonId);
            const belongsToTrainer = payload.eventType !== "DELETE" && next.owner_trainer_id === trainerId;
            if (!belongsToTrainer) return current.filter((entry) => entry.id !== pokemonId);
            if (!next.owner_id || !next.species_id) return current;

            const updated: SlotPokemon = {
              id: pokemonId,
              owner_id: next.owner_id,
              nickname: "nickname" in next ? next.nickname ?? null : existing?.nickname ?? null,
              team_slot: "team_slot" in next ? next.team_slot ?? null : existing?.team_slot ?? null,
              image_url: "image_url" in next ? next.image_url ?? null : existing?.image_url ?? null,
              species_id: next.species_id,
              marked: "marked" in next ? next.marked ?? false : existing?.marked ?? false,
            };
            return existing
              ? current.map((entry) => entry.id === pokemonId ? updated : entry)
              : [...current, updated];
          });
          refreshCharacters();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void qc.invalidateQueries({ queryKey: ["trainer-roster", trainerId] });
          refreshCharacters();
        }
      });

    return () => {
      if (characterRefreshTimer) clearTimeout(characterRefreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [gameId, trainerId, qc]);

  useEffect(() => {
    if (active.kind === "slot") {
      const pokemon = roster.find((entry) => entry.team_slot === active.slot) ?? null;
      if ((pokemon?.id ?? null) !== active.pokemonId) {
        setActive({ kind: "slot", slot: active.slot, pokemonId: pokemon?.id ?? null });
      }
      return;
    }
    if (active.kind === "pcPokemon" && !roster.some((entry) => entry.id === active.pokemonId && entry.team_slot === null)) {
      setActive({ kind: "pc" });
    }
  }, [active, roster]);

  function spriteFor(p: SlotPokemon | null): string | null {
    if (!p) return null;
    const species = spriteMap[p.species_id];
    return p.image_url || preferredPokemonSprite(species?.name, species?.sprite_url, false, spriteStyle) || null;
  }
  function nameFor(p: SlotPokemon | null): string {
    if (!p) return "";
    return p.nickname || spriteMap[p.species_id]?.name || "PokÃ©mon";
  }

  function payloadForPokemon(p: SlotPokemon): DragCharacterPayload {
    return {
      kind: "pokemon",
      id: p.id,
      label: nameFor(p),
      imageUrl: spriteFor(p),
      ownerId: p.owner_id,
    };
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
    await assignPokemonToTrainerRpc(pokemonId, trainerId, teamSlot);
  }

  async function movePokemonToTrainer(
    pokemonId: string,
    label: string,
    target: { kind: "pc" } | { kind: "slot"; slot: number } | { kind: "auto" },
    sourceSlot?: number,
  ) {
    if (!canEditRoster) {
      toast.error("VocÃª nÃ£o tem permissÃ£o para organizar este time.");
      return;
    }
    if (target.kind === "slot" && sourceSlot === target.slot) return;

    const teamSlot =
      target.kind === "pc" ? null :
      target.kind === "slot" ? target.slot :
      nextFreeTeamSlot(pokemonId);

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

  // Auto-register a pokemon (and its species) in this trainer's PokÃ©dex as captured.
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
      name: pkm.species?.name ?? pkm.nickname ?? "PokÃ©mon",
      captured: true,
      sprite_url: preferredPokemonSprite(pkm.species?.name, pkm.species?.sprite_url, false, spriteStyle) ?? null,
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
    if (!canEditRoster) {
      toast.error("VocÃª nÃ£o tem permissÃ£o para organizar este time.");
      return;
    }

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

  function beginTeamPointerDrag(e: React.PointerEvent, pokemon: SlotPokemon, fromSlot?: number) {
    if (!canEditRoster) return;
    if (e.button !== 0) return;
    teamPointerDragRef.current = {
      payload: payloadForPokemon(pokemon),
      fromSlot,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: falseç¿v¶‰žËkºwµç}±•…¸¤¤¤°4(€€€m…¹‘¥‘…Ñ•Ít°4(€€¤ì4(€½¹ÍÐì‘…Ñ„è…¹‘¥‘…Ñ•MÁ•¥•Í5…À€ôíôô€ôÕÍ•EÕ•Éä¡ì4(€€€ÅÕ•Éå-•äèl‰…¹‘¥‘…Ñ”µÍÁ•¥•Ìˆ°…¹‘¥‘…Ñ•MÁ•¥•Í%‘Ì¹©½¥¸ ˆ°ˆ¥t°4(€€€•¹…‰±•è½Á•¸€˜˜…¹‘¥‘…Ñ•MÁ•¥•Í%‘Ì¹±•¹Ñ €ø€À°4(€€€ÅÕ•Éå¸è…Íå¹Œ€ ¤€ôøì4(€€€€€½¹ÍÐì‘…Ñ„°•ÉÉ½Èô€ô…Ý…¥ÐÍÕÁ…‰…Í”4(€€€€€€€€¹™É½´ ‰ÍÁ•¥•Ìˆ¤4(€€€€€€€€¹Í•±•Ð ‰¥°ÍÁÉ¥Ñ•}ÕÉ°°¹…µ”ˆ¤4(€€€€€€€€¹¥¸ ‰¥ˆ°…¹‘¥‘…Ñ•MÁ•¥•Í%‘Ì¤ì4(€€€€€¥˜€¡•ÉÉ½È¤Ñ¡É½Ü•ÉÉ½Èì4(€€€€€½¹ÍÐ´èI•½ÉñÍÑÉ¥¹œ°ìÍÁÉ¥Ñ•}ÕÉ°èÍÑÉ¥¹œð¹Õ±°ì¹…µ”èÍÑÉ¥¹œôø€ôíôì4(€€€€€€¡‘…Ñ„€üümt¤¹™½É…  ¡Ì¤€ôøìµmÌ¹¥‘t€ôìÍÁÉ¥Ñ•}ÕÉ°èÌ¹ÍÁÉ¥Ñ•}ÕÉ°°¹…µ”èÌ¹¹…µ”ôìô¤ì4(€€€€€É•ÑÕÉ¸´ì4(€€€ô°4(€ô¤ì4(€½¹ÍÐÍÁ•¥•Í1½½­ÕÀ€ôÕÍ•5•µ¼ 4(€€€€ ¤€ôø€¡ì€¸¸¹ÍÁÉ¥Ñ•5…À°€¸¸¹…¹‘¥‘…Ñ•MÁ•¥•Í5…Àô¤°4(€€€mÍÁÉ¥Ñ•5…À°…¹‘¥‘…Ñ•MÁ•¥•Í5…Át°4(€€¤ì4(4(€½¹ÍÐ™¥±Ñ•É•€ôÕÍ•5•µ¼  ¤€ôøì4(€€€½¹ÍÐÄ€ôÍ•…É ¹ÑÉ¥´ ¤¹Ñ½1½Ý•É…Í” ¤ì4(€€€É•ÑÕÉ¸…¹‘¥‘…Ñ•Ì¹™¥±Ñ•È ¡À¤€ôøì4(€€€€€¥˜€ …Ä¤É•ÑÕÉ¸ÑÉÕ”ì4(€€€€€½¹ÍÐ¹´€ôÀ¹¹¥­¹…µ”ü¹Ñ½1½Ý•É…Í” ¤€üü€ˆˆì4(€€€€€½¹ÍÐÍÀ€ôÍÁ•¥•Í1½½­ÕÁmÀ¹ÍÁ•¥•Í}¥‘tü¹¹…µ”ü¹Ñ½1½Ý•É…Í” ¤€üü€ˆˆì4(€€€€€É•ÑÕÉ¸¹´¹¥¹±Õ‘•Ì¡Ä¤ñðÍÀ¹¥¹±Õ‘•Ì¡Ä¤ì4(€€€ô¤ì4(€ô°m…¹‘¥‘…Ñ•Ì°Í•…É °ÍÁ•¥•Í1½½­ÕÁt¤ì4(4(€…Íå¹Œ™Õ¹Ñ¥½¸…ÍÍ¥¸¡Á½­•µ½¹%èÍÑÉ¥¹œ¤ì(€€€¥˜€ ……¹‘¥Ð¤É•ÑÕÉ¸ì(€€€ÑÉäì(€€€€€…Ý…¥Ð…ÍÍ¥¹A½­•µ½¹Q½QÉ…¥¹•ÉIÁŒ¡Á½­•µ½¹%°ÑÉ…¥¹•É%°Í±½Ð¤ì(€€€ô…Ñ €¡•ÉÉ½È¤ì(€€€€€Ñ½…ÍÐ¹•ÉÉ½È¡•ÉÉ½È¥¹ÍÑ…¹•½˜ÉÉ½È€ü•ÉÉ½È¹µ•ÍÍ…”€è€‰9…¼™½¤Á½ÍÍ¥Ù•°…‘¥¥½¹…È…¼Ñ¥µ”¸ˆ¤ì(€€€€€É•ÑÕÉ¸ì(€€€ô(€€€Ñ½…ÍÐ¹ÍÕ•ÍÌ ‰‘‘•Ñ¼Ñ•…´ˆ¤ì(€€€Í•Ñ=Á•¸¡™…±Í”¤ì4(€€€½¹ÍÍ¥¹•¡Á½­•µ½¹%¤ì4(€ô4(4(€É•ÑÕÉ¸€ 4(€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à µ™Õ±°¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÀ´àˆø4(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰Üµ™Õ±°µ…àµÜµÍ´É½Õ¹‘•µ±œ‰½É‘•È‰½É‘•Èµ‘…Í¡•‰½É‘•Èµ‰½É‘•È‰œµ…ÉÀ´ØÑ•áÐµ•¹Ñ•Èˆø4(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µˆ´ÄÑ•áÐµÍ´™½¹Ðµ‰½±ˆùM±½ÐíÍ±½ÑôÙ…é¥¼ð½Àø4(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µˆ´ÐÑ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆø4(€€€€€€€€€ÑÉ¥‰Õ„Õ´A½¯¥µ½¸‘½Ì…ÉÅÕ¥Ù½Ì‘¼©½¼„•ÍÑ”Í±½Ð¸4(€€€€€€€€ð½Àø4(€€€€€€€í…¹‘¥Ð€ü€ (€€€€€€€€€€ñ	ÕÑÑ½¸Í¥é”ô‰Í´ˆ½¹±¥¬õì ¤€ôøÍ•Ñ=Á•¸¡ÑÉÕ”¥ôø(€€€€€€€€€€€€ñA±ÕÌ±…ÍÍ9…µ”ô‰µÈ´Ä ´Ì¸ÔÜ´Ì¸Ôˆ€¼ø‘¥¥½¹…È‘”¥±•Ì(€€€€€€€€€€ð½	ÕÑÑ½¸ø(€€€€€€€€¤€è€ (€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆùM½µ•¹Ñ”•‘¥Ñ½É•Ì‘•ÍÑ„™¥¡„Á½‘•´…±Ñ•É…È¼Ñ¥µ”¸ð½Àø(€€€€€€€€¥ô(€€€€€€ð½‘¥Øø4(4(€€€€€€ñ¥…±½œ½Á•¸õí½Á•¹ô½¹=Á•¹¡…¹”õíÍ•Ñ=Á•¹ôø4(€€€€€€€€ñ¥…±½½¹Ñ•¹Ð±…ÍÍ9…µ”ô‰µ…àµ µlàÁÙ¡tµ…àµÜµ±œ½Ù•É™±½Üµ¡¥‘‘•¸ˆø4(€€€€€€€€€€ñ¥…±½!•…‘•Èøñ¥…±½Q¥Ñ±”ù‘¥¥½¹…ÈA½¯¥µ½¸…¼M±½ÐíÍ±½Ñôð½¥…±½Q¥Ñ±”øð½¥…±½!•…‘•Èø4(€€€€€€€€€€ñ%¹ÁÕÐÁ±…•¡½±‘•Èô‰	ÕÍ…ËŠ˜ˆÙ…±Õ”õíÍ•…É¡ô½¹¡…¹”õì¡”¤€ôøÍ•ÑM•…É ¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô€¼ø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ…àµ µlÔÕÙ¡tÍÁ…”µä´Ä½Ù•É™±½Üµäµ…ÕÑ¼ˆø4(€€€€€€€€€€€í™¥±Ñ•É•¹µ…À ¡À¤€ôøì4(€€€€€€€€€€€€€½¹ÍÐÍÀ€ôÍÁ•¥•Í1½½­ÕÁmÀ¹ÍÁ•¥•Í}¥‘tì4(€€€€€€€€€€€€€½¹ÍÐÍÁÉ¥Ñ”€ôÀ¹¥µ…•}ÕÉ°ñðÁÉ•™•ÉÉ•‘A½­•µ½¹MÁÉ¥Ñ”¡ÍÀü¹¹…µ”°ÍÀü¹ÍÁÉ¥Ñ•}ÕÉ°°™…±Í”°ÍÁÉ¥Ñ•MÑå±”¤ì(€€€€€€€€€€€€€½¹ÍÐ¹´€ôÀ¹¹¥­¹…µ”ñðÍÀü¹¹…µ”ñð€‰A½¯¥µ½¸ˆì4(€€€€€€€€€€€€€É•ÑÕÉ¸€ 4(€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸4(€€€€€€€€€€€€€€€€€­•äõíÀ¹¥‘ô4(€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ4(€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôø…ÍÍ¥¸¡À¹¥¥ô4(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•àÜµ™Õ±°¥Ñ•µÌµ•¹Ñ•È…À´ÈÉ½Õ¹‘•µµ‰½É‘•È‰½É‘•Èµ‰½É‘•È‰œµ…ÉÁà´ÈÁä´Ä¸ÔÑ•áÐµ±•™Ð¡½Ù•Èé‰œµ…•¹Ðˆ4(€€€€€€€€€€€€€€€€ø4(€€€€€€€€€€€€€€€€€íÍÁÉ¥Ñ”4(€€€€€€€€€€€€€€€€€€€€ü€ñ¥µœÍÉŒõíÍÁÉ¥Ñ•ô…±Ðõí¹µô±…ÍÍ9…µ”ô‰ ´àÜ´à½‰©•Ðµ½¹Ñ…¥¸ˆ€¼ø4(€€€€€€€€€€€€€€€€€€€€è€ñ‘¥Ø±…ÍÍ9…µ”ô‰ ´àÜ´àÉ½Õ¹‘•‰œµµÕÑ•ˆ€¼ùô4(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰™±•à´ÄÑ•áÐµÍ´ˆùí¹µôð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€€íÀ¹½Ý¹•É}ÑÉ…¥¹•É}¥€ôôôÑÉ…¥¹•É%€˜˜À¹Ñ•…µ}Í±½Ð€ôôô¹Õ±°€˜˜€ 4(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÁÁátÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆø¡¹¼A¤ð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€€€¥ô4(€€€€€€€€€€€€€€€€€íÀ¹½Ý¹•É}ÑÉ…¥¹•É}¥€˜˜À¹½Ý¹•É}ÑÉ…¥¹•É}¥€„ôôÑÉ…¥¹•É%€˜˜€ 4(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÁÁátÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆø¡‘”½ÕÑÉ¼ÑÉ•¥¹…‘½È¤ð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€€€¥ô4(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€¤ì4(€€€€€€€€€€€ô¥ô4(€€€€€€€€€€€í™¥±Ñ•É•¹±•¹Ñ €ôôô€À€˜˜€ 4(€€€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰À´ÐÑ•áÐµ•¹Ñ•ÈÑ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆù9•¹¡Õ´A½¯¥µ½¸‘¥ÍÁ½»µÙ•°¸ð½Àø4(€€€€€€€€€€€€¥ô4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€ð½¥…±½½¹Ñ•¹Ðø4(€€€€€€ð½¥…±½œø4(€€€€ð½‘¥Øø4(€€¤ì4)ô4(4)™Õ¹Ñ¥½¸AÉ¥¡ì(€Á½­•µ½¸°…¹‘¥Ð°ÍÁÉ¥Ñ”°¹…µ”°½¹=Á•¸°½¹A½¥¹Ñ•ÉÉ…MÑ…ÉÐ°½¹É…MÑ…ÉÐ°½¹±¥­…ÁÑÕÉ”°½¹‘‘Q½Q•…´°½¹I•±•…Í”°½¹Q½±•5…É¬°)ôèì(€Á½­•µ½¸èM±½ÑA½­•µ½¹mtì(€…¹‘¥Ðè‰½½±•…¸ì(€ÍÁÉ¥Ñ”è€¡ÀèM±½ÑA½­•µ½¸¤€ôøÍÑÉ¥¹œð¹Õ±°ì(€¹…µ”è€¡ÀèM±½ÑA½­•µ½¸¤€ôøÍÑÉ¥¹œì(€½¹=Á•¸è€¡Á½­•µ½¹%èÍÑÉ¥¹œ¤€ôøÙ½¥ì(€½¹A½¥¹Ñ•ÉÉ…MÑ…ÉÐè€¡”èI•…Ð¹A½¥¹Ñ•ÉÙ•¹Ð°Á½­•µ½¸èM±½ÑA½­•µ½¸¤€ôøÙ½¥ì(€½¹É…MÑ…ÉÐè€¡”èI•…Ð¹É…Ù•¹Ð°Á½­•µ½¸èM±½ÑA½­•µ½¸¤€ôøÙ½¥ì(€½¹±¥­…ÁÑÕÉ”è€¡”èI•…Ð¹5½ÕÍ•Ù•¹Ð¤€ôøÙ½¥ì(€½¹‘‘Q½Q•…´è€¡Á½­•µ½¹%èÍÑÉ¥¹œ¤€ôøÙ½¥ðAÉ½µ¥Í”ñÙ½¥øì(€½¹I•±•…Í”è€¡Á½­•µ½¹%èÍÑÉ¥¹œ¤€ôøÙ½¥ðAÉ½µ¥Í”ñÙ½¥øì(€½¹Q½±•5…É¬è€¡Á½­•µ½¹%èÍÑÉ¥¹œ°µ…É­•è‰½½±•…¸¤€ôøÙ½¥ðAÉ½µ¥Í”ñÙ½¥øì)ô¤ì(€½¹ÍÐmÉ•±•…Í•Q…É•Ð°Í•ÑI•±•…Í•Q…É•Ñt€ôÕÍ•MÑ…Ñ”ñM±½ÑA½­•µ½¸ð¹Õ±°ø¡¹Õ±°¤ì(€½¹ÍÐmÍ•…É °Í•ÑM•…É¡t€ôÕÍ•MÑ…Ñ” ˆˆ¤ì(€½¹ÍÐmµ…É­•‘=¹±ä°Í•Ñ5…É­•‘=¹±åt€ôÕÍ•MÑ…Ñ”¡™…±Í”¤ì(€½¹ÍÐÙ¥Í¥‰±•A½­•µ½¸€ôÕÍ•5•µ¼  ¤€ôøì(€€€½¹ÍÐÅÕ•Éä€ôÍ•…É ¹ÑÉ¥´ ¤¹Ñ½1½…±•1½Ý•É…Í” ‰ÁÐµ	Hˆ¤ì(€€€É•ÑÕÉ¸Á½­•µ½¸(€€€€€€¹™¥±Ñ•È ¡•¹ÑÉä¤€ôø€…µ…É­•‘=¹±äñð•¹ÑÉä¹µ…É­•¤(€€€€€€¹™¥±Ñ•È ¡•¹ÑÉä¤€ôø€…ÅÕ•Éäñð¹…µ”¡•¹ÑÉä¤¹Ñ½1½…±•1½Ý•É…Í” ‰ÁÐµ	Hˆ¤¹¥¹±Õ‘•Ì¡ÅÕ•Éä¤¤(€€€€€€¹Í½ÉÐ ¡±•™Ð°É¥¡Ð¤€ôøì(€€€€€€€¥˜€¡±•™Ð¹µ…É­•€„ôôÉ¥¡Ð¹µ…É­•¤É•ÑÕÉ¸±•™Ð¹µ…É­•€ü€´Ä€è€Äì(€€€€€€€É•ÑÕÉ¸¹…µ”¡±•™Ð¤¹±½…±•½µÁ…É”¡¹…µ”¡É¥¡Ð¤°€‰ÁÐµ	Hˆ¤ì(€€€€€ô¤ì(€ô°mÁ½­•µ½¸°µ…É­•‘=¹±ä°Í•…É °¹…µ•t¤ì((€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´ÌÀ´Ðˆ‘…Ñ„µÁ½­•µ½¸µÁŒµ‘É½ÀµÑ…É•Ðõí…¹‘¥Ð€ü€‰ÑÉÕ”ˆ€èÕ¹‘•™¥¹•‘ôø(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø4(€€€€€€€€ñ	½á•Ì±…ÍÍ9…µ”ô‰ ´ÐÜ´ÐÑ•áÐµÍÕ•ÍÌˆ€¼ø4(€€€€€€€€ñ Ì±…ÍÍ9…µ”ô‰Ñ•áÐµÍ´™½¹Ðµ‰½±ˆùAƒ
Ü…¥á„‘”A½¯¥µ½¸ð½ Ìø4(€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰µ°µ…ÕÑ¼Ñ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆùíÁ½­•µ½¸¹±•¹Ñ¡ôÕ…É‘…‘¼¡Ì¤ð½ÍÁ…¸ø(€€€€€€ð½‘¥Øø(€€€€€íÁ½­•µ½¸¹±•¹Ñ €ø€À€˜˜€ (€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É•±…Ñ¥Ù”µ¥¸µÜ´À™±•à´Äˆø(€€€€€€€€€€€€ñM•…É ±…ÍÍ9…µ”ô‰Á½¥¹Ñ•Èµ•Ù•¹ÑÌµ¹½¹”…‰Í½±ÕÑ”±•™Ð´È¸ÔÑ½À´Ä¼È ´ÐÜ´Ð€µÑÉ…¹Í±…Ñ”µä´Ä¼ÈÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆ€¼ø(€€€€€€€€€€€€ñ%¹ÁÕÐ(€€€€€€€€€€€€€Ù…±Õ”õíÍ•…É¡ô(€€€€€€€€€€€€€½¹¡…¹”õì¡•Ù•¹Ð¤€ôøÍ•ÑM•…É ¡•Ù•¹Ð¹Ñ…É•Ð¹Ù…±Õ”¥ô(€€€€€€€€€€€€€Á±…•¡½±‘•Èô‰	ÕÍ…È¹¼AŠ˜ˆ(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´äÁ°´àˆ(€€€€€€€€€€€€¼ø(€€€€€€€€€€ð½‘¥Øø(€€€€€€€€€€ñ	ÕÑÑ½¸(€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€Í¥é”ô‰¥½¸ˆ(€€€€€€€€€€€Ù…É¥…¹Ðõíµ…É­•‘=¹±ä€ü€‰‘•™…Õ±Ðˆ€è€‰½ÕÑ±¥¹”‰ô(€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´äÜ´äÍ¡É¥¹¬´Àˆ(€€€€€€€€€€€Ñ¥Ñ±”õíµ…É­•‘=¹±ä€ü€‰5½ÍÑÉ…ÈÑ½‘½Ìˆ€è€‰5½ÍÑÉ…È…Á•¹…Ìµ…É…‘½Ì‰ô(€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•Ñ5…É­•‘=¹±ä ¡Ù…±Õ”¤€ôø€…Ù…±Õ”¥ô(€€€€€€€€€€ø(€€€€€€€€€€€€ñ±…œ±…ÍÍ9…µ”õí¸ ‰ ´ÐÜ´Ðˆ°µ…É­•‘=¹±ä€˜˜€‰™¥±°µÕÉÉ•¹Ðˆ¥ô€¼ø(€€€€€€€€€€ð½	ÕÑÑ½¸ø(€€€€€€€€ð½‘¥Øø(€€€€€€¥ô(€€€€€íÁ½­•µ½¸¹±•¹Ñ €ôôô€À€ü€ 4(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰É½Õ¹‘•µ±œ‰½É‘•È‰½É‘•Èµ‘…Í¡•‰½É‘•Èµ‰½É‘•È‰œµ…ÉÀ´ØÑ•áÐµ•¹Ñ•ÈÑ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆø4(€€€€€€€€€M•´A½¯¥µ½¸¹¼A¸A½¯¥µ½¸…ÁÑÕÉ…‘½ÌÅÕ”»¼•ÍÓ¼¹„•ÅÕ¥Á”…Á…É••Ë¼…ÅÕ¤¸4(€€€€€€€€ð½Àø4(€€€€€€¤€è€ 4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥É¥µ½±Ì´Ð…À´ÈÍ´éÉ¥µ½±Ì´Øˆø4(€€€€€€€€€íÙ¥Í¥‰±•A½­•µ½¸¹µ…À ¡À¤€ôøì(€€€€€€€€€€€½¹ÍÐÌ€ôÍÁÉ¥Ñ”¡À¤ì4(€€€€€€€€€€€É•ÑÕÉ¸€ 4(€€€€€€€€€€€€€€ñÉ½Á‘½Ý¹5•¹Ô­•äõíÀ¹¥‘ôø4(€€€€€€€€€€€€€€€€ñÉ½Á‘½Ý¹5•¹ÕQÉ¥•È…Í¡¥±ø4(€€€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸(€€€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ(€€€€€€€€€€€€€€€€€€€Ñ¥Ñ±”õí¹…µ”¡À¥ô(€€€€€€€€€€€€€€€€€€€‘É……‰±”õí…¹‘¥Ñô(€€€€€€€€€€€€€€€€€€€½¹A½¥¹Ñ•É½Ý¸õí…¹‘¥Ð€ü€¡”¤€ôø½¹A½¥¹Ñ•ÉÉ…MÑ…ÉÐ¡”°À¤€èÕ¹‘•™¥¹•‘ô(€€€€€€€€€€€€€€€€€€€½¹É…MÑ…ÉÐõí…¹‘¥Ð€ü€¡”¤€ôø½¹É…MÑ…ÉÐ¡”°À¤€èÕ¹‘•™¥¹•‘ô(€€€€€€€€€€€€€€€€€€€½¹±¥­…ÁÑÕÉ”õí½¹±¥­…ÁÑÕÉ•ô(€€€€€€€€€€€€€€€€€€€ÍÑå±”õíìÑ½Õ¡Ñ¥½¸è€‰¹½¹”ˆ°]•‰­¥ÑUÍ•ÉÉ…œè€‰¹½¹”ˆ°ÕÍ•ÉM•±•Ðè€‰¹½¹”ˆô…ÌMMAÉ½Á•ÉÑ¥•Íô(€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”õí¸ (€€€€€€€€€€€€€€€€€€€€€€‰É•±…Ñ¥Ù”™±•à…ÍÁ•ÐµÍÅÕ…É”™±•àµ½°¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•È…À´ÄÉ½Õ¹‘•µµ‰½É‘•È‰œµ…ÉÀ´Ä¡½Ù•Èé‰½É‘•ÈµÁÉ¥µ…Éä¡½Ù•Èé‰œµ…•¹Ðˆ°4(€€€€€€€€€€€€€€€€€€€€€À¹µ…É­•€ü€‰‰½É‘•Èµ…µ‰•È´ÔÀÀÉ¥¹œ´ÄÉ¥¹œµ…µ‰•È´ÔÀÀ¼ØÀˆ€è€‰‰½É‘•Èµ‰½É‘•Èˆ°4(€€€€€€€€€€€€€€€€€€€€¥ô4(€€€€€€€€€€€€€€€€€€ø4(€€€€€€€€€€€€€€€€€€€íÀ¹µ…É­•€˜˜€ 4(€€€€€€€€€€€€€€€€€€€€€€ñ±…œ±…ÍÍ9…µ”ô‰…‰Í½±ÕÑ”É¥¡Ð´À¸ÔÑ½À´À¸Ô ´ÌÜ´Ì™¥±°µ…µ‰•È´ÔÀÀÑ•áÐµ…µ‰•È´ÔÀÀˆ€¼ø4(€€€€€€€€€€€€€€€€€€€€¥ô4(€€€€€€€€€€€€€€€€€€€íÌ4(€€€€€€€€€€€€€€€€€€€€€€ü€ñ¥µœÍÉŒõíÍô…±Ðõí¹…µ”¡À¥ô±…ÍÍ9…µ”ô‰ ´ÄÈÜ´ÄÈ½‰©•Ðµ½¹Ñ…¥¸ˆ€¼ø4(€€€€€€€€€€€€€€€€€€€€€€è€ñ‘¥Ø±…ÍÍ9…µ”ô‰ ´ÄÈÜ´ÄÈÉ½Õ¹‘•‰œµµÕÑ•ˆ€¼ùô4(€€€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰±¥¹”µ±…µÀ´ÄÑ•áÐµlÄÁÁát™½¹Ðµµ•‘¥Õ´ˆùí¹…µ”¡À¥ôð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€ð½É½Á‘½Ý¹5•¹ÕQÉ¥•Èø(€€€€€€€€€€€€€€€€ñÉ½Á‘½Ý¹5•¹Õ½¹Ñ•¹Ð…±¥¸ô‰ÍÑ…ÉÐˆ±…ÍÍ9…µ”ô‰Ü´Ðàˆø(€€€€€€€€€€€€€€€€€€ñÉ½Á‘½Ý¹5•¹Õ%Ñ•´½¹±¥¬õì ¤€ôø½¹=Á•¸¡À¹¥¥ôø(€€€€€€€€€€€€€€€€€€€€ñ¥±•Q•áÐ±…ÍÍ9…µ”ô‰µÈ´È ´ÐÜ´Ðˆ€¼ø¥¡„(€€€€€€€€€€€€€€€€€€ð½É½Á‘½Ý¹5•¹Õ%Ñ•´ø(€€€€€€€€€€€€€€€€€í…¹‘¥Ð€˜˜€ (€€€€€€€€€€€€€€€€€€€€ðø(€€€€€€€€€€€€€€€€€€€€€€ñÉ½Á‘½Ý¹5•¹Õ%Ñ•´½¹±¥¬õì ¤€ôø½¹‘‘Q½Q•…´¡À¹¥¥ôø(€€€€€€€€€€€€€€€€€€€€€€€€ñÉÉ½ÝUÁÉ½µ1¥¹”±…ÍÍ9…µ”ô‰µÈ´È ´ÐÜ´Ðˆ€¼ø‘¥¥½¹…È…¼Ñ¥µ”(€€€€€€€€€€€€€€€€€€€€€€ð½É½Á‘½Ý¹5•¹Õ%Ñ•´ø(€€€€€€€€€€€€€€€€€€€€€€ñÉ½Á‘½Ý¹5•¹Õ%Ñ•´½¹±¥¬õì ¤€ôø½¹Q½±•5…É¬¡À¹¥°À¹µ…É­•¥ôø(€€€€€€€€€€€€€€€€€€€€€€€€ñ±…œ±…ÍÍ9…µ”ô‰µÈ´È ´ÐÜ´Ðˆ€¼øíÀ¹µ…É­•€ü€‰•Íµ…É…Èˆ€è€‰5…É…È‰ô(€€€€€€€€€€€€€€€€€€€€€€ð½É½Á‘½Ý¹5•¹Õ%Ñ•´ø(€€€€€€€€€€€€€€€€€€€€€€ñÉ½Á‘½Ý¹5•¹ÕM•Á…É…Ñ½È€¼ø(€€€€€€€€€€€€€€€€€€€€€€ñÉ½Á‘½Ý¹5•¹Õ%Ñ•´(€€€€€€€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Ñ•áÐµ‘•ÍÑÉÕÑ¥Ù”™½ÕÌéÑ•áÐµ‘•ÍÑÉÕÑ¥Ù”ˆ(€€€€€€€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•ÑI•±•…Í•Q…É•Ð¡À¥ô(€€€€€€€€€€€€€€€€€€€€€€ø(€€€€€€€€€€€€€€€€€€€€€€€€ñQÉ…Í È±…ÍÍ9…µ”ô‰µÈ´È ´ÐÜ´Ðˆ€¼ø1¥‰•É…È(€€€€€€€€€€€€€€€€€€€€€€ð½É½Á‘½Ý¹5•¹Õ%Ñ•´ø(€€€€€€€€€€€€€€€€€€€€ð¼ø(€€€€€€€€€€€€€€€€€€¥ô(€€€€€€€€€€€€€€€€ð½É½Á‘½Ý¹5•¹Õ½¹Ñ•¹Ðø(€€€€€€€€€€€€€€ð½É½Á‘½Ý¹5•¹Ôø4(€€€€€€€€€€€€¤ì4(€€€€€€€€€ô¥ô(€€€€€€€€€íÙ¥Í¥‰±•A½­•µ½¸¹±•¹Ñ €ôôô€À€˜˜€ (€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰½°µÍÁ…¸µ™Õ±°É½Õ¹‘•µµ‰½É‘•È‰½É‘•Èµ‘…Í¡•‰½É‘•Èµ‰½É‘•ÈÀ´ÐÑ•áÐµ•¹Ñ•ÈÑ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆø(€€€€€€€€€€€€€9•¹¡Õ´A½¯¥µ½¸½ÉÉ•ÍÁ½¹‘”„•ÍÑ”™¥±ÑÉ¼¸(€€€€€€€€€€€€ð½Àø(€€€€€€€€€€¥ô(€€€€€€€€ð½‘¥Øø(€€€€€€¥ô4(4(€€€€€€ñ±•ÉÑ¥…±½œ½Á•¸õì„…É•±•…Í•Q…É•Ñô½¹=Á•¹¡…¹”õì¡¼¤€ôøì¥˜€ …¼¤Í•ÑI•±•…Í•Q…É•Ð¡¹Õ±°¤ìõôø4(€€€€€€€€ñ±•ÉÑ¥…±½½¹Ñ•¹Ðø4(€€€€€€€€€€ñ±•ÉÑ¥…±½!•…‘•Èø4(€€€€€€€€€€€€ñ±•ÉÑ¥…±½Q¥Ñ±”ù1¥‰•É…ÈíÉ•±•…Í•Q…É•Ð€ü¹…µ”¡É•±•…Í•Q…É•Ð¤€è€‰A½¯¥µ½¸‰ôüð½±•ÉÑ¥…±½Q¥Ñ±”ø4(€€€€€€€€€€€€ñ±•ÉÑ¥…±½•ÍÉ¥ÁÑ¥½¸ø4(€€€€€€€€€€€€€ÍÑ„‡Ÿ¼ƒ¤Á•Éµ…¹•¹Ñ””»¼Á½‘”Í•È‘•Í™•¥Ñ„¸4(€€€€€€€€€€€€ð½±•ÉÑ¥…±½•ÍÉ¥ÁÑ¥½¸ø4(€€€€€€€€€€ð½±•ÉÑ¥…±½!•…‘•Èø4(€€€€€€€€€€ñ±•ÉÑ¥…±½½½Ñ•Èø4(€€€€€€€€€€€€ñ±•ÉÑ¥…±½…¹•°ù…¹•±…Èð½±•ÉÑ¥…±½…¹•°ø4(€€€€€€€€€€€€ñ±•ÉÑ¥…±½Ñ¥½¸4(€€€€€€€€€€€€€½¹±¥¬õí…Íå¹Œ€ ¤€ôøì4(€€€€€€€€€€€€€€€¥˜€¡É•±•…Í•Q…É•Ð¤…Ý…¥Ð½¹I•±•…Í”¡É•±•…Í•Q…É•Ð¹¥¤ì4(€€€€€€€€€€€€€€€Í•ÑI•±•…Í•Q…É•Ð¡¹Õ±°¤ì4(€€€€€€€€€€€€€õô4(€€€€€€€€€€€€ø4(€€€€€€€€€€€€€1¥‰•É…È4(€€€€€€€€€€€€ð½±•ÉÑ¥…±½Ñ¥½¸ø4(€€€€€€€€€€ð½±•ÉÑ¥…±½½½Ñ•Èø4(€€€€€€€€ð½±•ÉÑ¥…±½½¹Ñ•¹Ðø4(€€€€€€ð½±•ÉÑ¥…±½œø4(€€€€ð½‘¥Øø4(€€¤ì4)ô4(4)™Õ¹Ñ¥½¸5¥¹¥µ…±M¡••ÑY¥•Ü¡ì4(€ÑÉ…¥¹•É%°µ•Ñ„°…¹‘¥Ð°½¹•±•Ñ•°4)ôèì4(€ÑÉ…¥¹•É%èÍÑÉ¥¹œì4(€µ•Ñ„èì¹…µ”èÍÑÉ¥¹œì¥µ…•}ÕÉ°èÍÑÉ¥¹œð¹Õ±°ì‘•ÍÉ¥ÁÑ¥½¸èÍÑÉ¥¹œð¹Õ±°ôì4(€…¹‘¥Ðè‰½½±•…¸ì4(€½¹•±•Ñ•üè€ ¤€ôøÙ½¥ì4)ô¤ì4(€½¹ÍÐÅŒ€ôÕÍ•EÕ•Éå±¥•¹Ð ¤ì4(€½¹ÍÐm¹…µ”°Í•Ñ9…µ•t€ôÕÍ•MÑ…Ñ”¡µ•Ñ„¹¹…µ”¤ì4(€½¹ÍÐm‘•ÍŒ°Í•Ñ•Ít€ôÕÍ•MÑ…Ñ”¡µ•Ñ„¹‘•ÍÉ¥ÁÑ¥½¸€üü€ˆˆ¤ì4(€½¹ÍÐm½¹™¥Éµ•°°Í•Ñ½¹™¥Éµ•±t€ôÕÍ•MÑ…Ñ”¡™…±Í”¤ì4(€…Íå¹Œ™Õ¹Ñ¥½¸Á…Ñ ¡™¥•±‘ÌèI•½ÉñÍÑÉ¥¹œ°Õ¹­¹½Ý¸ø¤ì4(€€€€¼¼•Í±¥¹Ðµ‘¥Í…‰±”µ¹•áÐµ±¥¹”ÑåÁ•ÍÉ¥ÁÐµ•Í±¥¹Ð½¹¼µ•áÁ±¥¥Ðµ…¹ä4(€€€½¹ÍÐì•ÉÉ½Èô€ô…Ý…¥Ð€¡ÍÕÁ…‰…Í”¹™É½´ ‰ÑÉ…¥¹•ÉÌˆ¤…Ì…¹ä¤¹ÕÁ‘…Ñ”¡™¥•±‘Ì¤¹•Ä ‰¥ˆ°ÑÉ…¥¹•É%¤ì4(€€€¥˜€¡•ÉÉ½È¤ìÑ½…ÍÐ¹•ÉÉ½È¡•ÉÉ½È¹µ•ÍÍ…”¤ìÉ•ÑÕÉ¸ìô4(€€€ÅŒ¹¥¹Ù…±¥‘…Ñ•EÕ•É¥•Ì¡ìÅÕ•Éå-•äèl‰ÑÉ…¥¹•Èµµ•Ñ„ˆ°ÑÉ…¥¹•É%‘tô¤ì4(€€€ÅŒ¹¥¹Ù…±¥‘…Ñ•EÕ•É¥•Ì¡ìÅÕ•Éå-•äèl‰¡…É…Ñ•ÉÌ‰tô¤ì4(€ô4(€É•ÑÕÉ¸€ 4(€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´ÌÀ´Ðˆø4(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµÍÑ…ÉÐ…À´Ìˆø4(€€€€€€€íµ•Ñ„¹¥µ…•}ÕÉ°€ü€ 4(€€€€€€€€€€ñ¥µœÍÉŒõíµ•Ñ„¹¥µ…•}ÕÉ±ô…±Ðõíµ•Ñ„¹¹…µ•ô±…ÍÍ9…µ”ô‰ ´ÐÀÜ´ÐÀÉ½Õ¹‘•µá°‰½É‘•È‰½É‘•Èµ‰½É‘•È½‰©•Ðµ½Ù•Èˆ€¼ø4(€€€€€€€€¤€è€ 4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à ´ÐÀÜ´ÐÀ¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ•¹Ñ•ÈÉ½Õ¹‘•µá°‰½É‘•È‰½É‘•Èµ‘…Í¡•‰½É‘•Èµ‰½É‘•È‰œµµÕÑ•Ñ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆùM•´¥µ…•´ð½‘¥Øø4(€€€€€€€€¥ô4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à™±•à´Ä™±•àµ½°…À´Èˆø4(€€€€€€€€€€ñ%¹ÁÕÐÙ…±Õ”õí¹…µ•ô‘¥Í…‰±•õì……¹‘¥Ñô½¹¡…¹”õì¡”¤€ôøÍ•Ñ9…µ”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô½¹	±ÕÈõì ¤€ôø¹…µ”€„ôôµ•Ñ„¹¹…µ”€˜˜Á…Ñ ¡ì¹…µ”ô¥ô±…ÍÍ9…µ”ô‰Ñ•áÐµ±œ™½¹Ðµ‰½±ˆ€¼ø4(€€€€€€€€€í…¹‘¥Ð€˜˜€ 4(€€€€€€€€€€€€ñ5¥¹¥µ…±%µ…•A¥­•ÈÕÉÉ•¹ÑUÉ°õíµ•Ñ„¹¥µ…•}ÕÉ±ô½¹A¥¬õì¡ÕÉ°¤€ôøÁ…Ñ ¡ì¥µ…•}ÕÉ°èÕÉ°ô¥ô€¼ø4(€€€€€€€€€€¥ô4(€€€€€€€€ð½‘¥Øø4(€€€€€€ð½‘¥Øø4(€€€€€€ñ‘¥Øø4(€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰Ñ•áÐµáÌ™½¹Ðµ‰½±ˆù•ÍÉ§Ÿ¼ð½±…‰•°ø4(€€€€€€€€ñÑ•áÑ…É•„4(€€€€€€€€€Ù…±Õ”õí‘•Íô4(€€€€€€€€€‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÍ•Ñ•ÍŒ¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô4(€€€€€€€€€½¹	±ÕÈõì ¤€ôø‘•ÍŒ€„ôô€¡µ•Ñ„¹‘•ÍÉ¥ÁÑ¥½¸€üü€ˆˆ¤€˜˜Á…Ñ ¡ì‘•ÍÉ¥ÁÑ¥½¸è‘•ÍŒô¥ô4(€€€€€€€€€É½ÝÌõìÄÉô4(€€€€€€€€€±…ÍÍ9…µ”ô‰µÐ´ÄÜµ™Õ±°É½Õ¹‘•µµ‰½É‘•È‰½É‘•Èµ‰½É‘•È‰œµ‰…­É½Õ¹À´ÈÑ•áÐµÍ´ˆ4(€€€€€€€€€Á±…•¡½±‘•Èô‰9½Ñ…Ì±¥ÙÉ•Ì°‘•ÍÉ§Ÿ¼°…¹½Ñ‡ŸÕ•ÏŠ˜ˆ4(€€€€€€€€¼ø4(€€€€€€ð½‘¥Øø4(€€€€€í…¹‘¥Ð€˜˜€ 4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à©ÕÍÑ¥™äµ•¹ˆø4(€€€€€€€€€€ñ±•ÉÑ¥…±½œ½Á•¸õí½¹™¥Éµ•±ô½¹=Á•¹¡…¹”õíÍ•Ñ½¹™¥Éµ•±ôø4(€€€€€€€€€€€€ñ	ÕÑÑ½¸Í¥é”ô‰Í´ˆÙ…É¥…¹Ðô‰‘•ÍÑÉÕÑ¥Ù”ˆ½¹±¥¬õì ¤€ôøÍ•Ñ½¹™¥Éµ•°¡ÑÉÕ”¥ôø4(€€€€€€€€€€€€€€ñQÉ…Í È±…ÍÍ9…µ”ô‰µÈ´Ä ´Ì¸ÔÜ´Ì¸Ôˆ€¼øÁ……È™¥¡„4(€€€€€€€€€€€€ð½	ÕÑÑ½¸ø4(€€€€€€€€€€€€ñ±•ÉÑ¥…±½½¹Ñ•¹Ðø4(€€€€€€€€€€€€€€ñ±•ÉÑ¥…±½!•…‘•Èø4(€€€€€€€€€€€€€€€€ñ±•ÉÑ¥…±½Q¥Ñ±”ùÁ……È•ÍÑ„™¥¡„üð½±•ÉÑ¥…±½Q¥Ñ±”ø4(€€€€€€€€€€€€€€€€ñ±•ÉÑ¥…±½•ÍÉ¥ÁÑ¥½¸ùÍÑ„‡Ÿ¼»¼Á½‘”Í•È‘•Í™•¥Ñ„¸ð½±•ÉÑ¥…±½•ÍÉ¥ÁÑ¥½¸ø4(€€€€€€€€€€€€€€ð½±•ÉÑ¥…±½!•…‘•Èø4(€€€€€€€€€€€€€€ñ±•ÉÑ¥…±½½½Ñ•Èø4(€€€€€€€€€€€€€€€€ñ±•ÉÑ¥…±½…¹•°ù…¹•±…Èð½±•ÉÑ¥…±½…¹•°ø4(€€€€€€€€€€€€€€€€ñ±•ÉÑ¥…±½Ñ¥½¸½¹±¥¬õí…Íå¹Œ€ ¤€ôøì4(€€€€€€€€€€€€€€€€€…Ý…¥ÐÍÕÁ…‰…Í”¹™É½´ ‰ÑÉ…¥¹•ÉÌˆ¤¹‘•±•Ñ” ¤¹•Ä ‰¥ˆ°ÑÉ…¥¹•É%¤ì4(€€€€€€€€€€€€€€€€€Ñ½…ÍÐ¹ÍÕ•ÍÌ ‰¥¡„…Á……‘„ˆ¤ì4(€€€€€€€€€€€€€€€€€½¹•±•Ñ•ü¸ ¤ì4(€€€€€€€€€€€€€€€õôùÁ……Èð½±•ÉÑ¥…±½Ñ¥½¸ø4(€€€€€€€€€€€€€€ð½±•ÉÑ¥…±½½½Ñ•Èø4(€€€€€€€€€€€€ð½±•ÉÑ¥…±½½¹Ñ•¹Ðø4(€€€€€€€€€€ð½±•ÉÑ¥…±½œø4(€€€€€€€€ð½‘¥Øø4(€€€€€€¥ô4(€€€€ð½‘¥Øø4(€€¤ì4)ô4(4)™Õ¹Ñ¥½¸5¥¹¥µ…±%µ…•A¥­•È¡ìÕÉÉ•¹ÑUÉ°°½¹A¥¬ôèìÕÉÉ•¹ÑUÉ°èÍÑÉ¥¹œð¹Õ±°ì½¹A¥¬è€¡ÕÉ°èÍÑÉ¥¹œð¹Õ±°¤€ôøÙ½¥ô¤ì4(€€¼¼1…éä¥µÁ½ÉÐÑ¼…Ù½¥¥ÉÕ±…È¥ÍÍÕ•Ì¥¸ÍÑÉ¥Ñ•È‰Õ¹‘±•ÉÌì­••ÀÍ¥µÁ±”¥¹±¥¹”¸4(€€4(€É•ÑÕÉ¸€ 4(€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à…À´Ä¸Ôˆø4(€€€€€€ñ%µ…•M½ÕÉ•¥…±½œÑ¥Ñ±”ô‰%µ…•´‘„™¥¡„ˆ½¹A¥¬õì¡ÔèÍÑÉ¥¹œ¤€ôø½¹A¥¬¡Ô¥ô€¼ø4(€€€€€íÕÉÉ•¹ÑUÉ°€˜˜€ 4(€€€€€€€€ñ	ÕÑÑ½¸Í¥é”ô‰Í´ˆÙ…É¥…¹Ðô‰½ÕÑ±¥¹”ˆ½¹±¥¬õì ¤€ôø½¹A¥¬¡¹Õ±°¥ôùI•µ½Ù•È¥µ…•´ð½	ÕÑÑ½¸ø4(€€€€€€¥ô4(€€€€ð½‘¥Øø4(€€¤ì4)ô4