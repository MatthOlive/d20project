import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Dices,
  FolderPlus,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { DragCharacterPayload } from "@/components/MapBoard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { transparentDigiRoleImageUrl } from "@/lib/digi-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CharacterDragPreview, useCharacterPointerDrag } from "@/hooks/use-character-pointer-drag";
import { fetchDigiApiImage } from "@/lib/digi-api";
import { fetchDigiRoleSignatureTechniqueId } from "@/lib/digirole-techniques";
import {
  DIGIROLE_STAGES,
  defaultDigiRoleAttrs,
  defaultDigiRoleSkills,
  defaultDigiRoleNotoriety,
  digiRoleDigimonDsMax,
  digiRoleDigimonHpMax,
} from "@/lib/digirole";

export type DigiRoleWindow = {
  kind: "digirole_tamer" | "digirole_digimon";
  id: string;
  title: string;
};

type TamerRow = {
  id: string;
  name: string;
  owner_id: string;
  image_url: string | null;
  rank: string;
  folder: string | null;
};

type SpeciesRow = {
  id: string;
  name: string;
  stage: string;
  digi_attribute: string;
  fields: string[];
  hp_base: number;
  base_attrs: Record<string, number>;
  signature_technique: string | null;
  image_url: string | null;
};

type DigimonRow = {
  id: string;
  nickname: string | null;
  owner_id: string;
  image_url: string | null;
  rank: string;
  image_hidden: boolean;
  folder: string | null;
  species: SpeciesRow | null;
};

function table(name: string) {
  return supabase.from(name as never) as never as ReturnType<typeof supabase.from>;
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

export function DigiRoleFilesPanel({
  gameId,
  userId,
  isNarrator,
  onOpen,
}: {
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onOpen: (window: DigiRoleWindow) => void;
}) {
  const queryClient = useQueryClient();
  const [digimonOpen, setDigimonOpen] = useState(false);
  const [speciesId, setSpeciesId] = useState("");
  const [nickname, setNickname] = useState("");
  const [search, setSearch] = useState("");
  const [routeName, setRouteName] = useState("");
  const [routeId, setRouteId] = useState("");
  const [fileSearch, setFileSearch] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`digirole-folders:${gameId}`) ?? "{}");
    } catch {
      return {};
    }
  });
  const [extraFolders, setExtraFolders] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`digirole-extra-folders:${gameId}`) ?? "[]");
    } catch {
      return [];
    }
  });
  const pointerDrag = useCharacterPointerDrag();

  useEffect(() => {
    localStorage.setItem(`digirole-folders:${gameId}`, JSON.stringify(collapsed));
  }, [collapsed, gameId]);
  useEffect(() => {
    localStorage.setItem(`digirole-extra-folders:${gameId}`, JSON.stringify(extraFolders));
  }, [extraFolders, gameId]);

  const routesQuery = useQuery({
    queryKey: ["digirole-routes", gameId],
    enabled: digimonOpen && isNarrator,
    queryFn: async () => {
      const result = await table("digirole_routes")
        .select("id,name,species_ids")
        .eq("game_id", gameId)
        .order("name");
      if (result.error) throw result.error;
      return (result.data ?? []) as unknown as Array<{
        id: string;
        name: string;
        species_ids: string[];
      }>;
    },
  });

  const filesQuery = useQuery({
    queryKey: ["digirole-files", gameId, userId, isNarrator],
    queryFn: async () => {
      const [tamers, digimons] = await Promise.all([
        table("digirole_tamers")
          .select("id,name,owner_id,image_url,rank,folder")
          .eq("game_id", gameId)
          .order("created_at"),
        table("digirole_digimons")
          .select(
            "id,nickname,owner_id,image_url,image_hidden,rank,folder,species:species_id(id,name,stage,digi_attribute,fields,hp_base,base_attrs,signature_technique,image_url)",
          )
          .eq("game_id", gameId)
          .order("created_at"),
      ]);
      if (tamers.error) throw tamers.error;
      if (digimons.error) throw digimons.error;
      return {
        tamers: ((tamers.data ?? []) as unknown as TamerRow[]).filter(
          (row) => isNarrator || row.owner_id === userId,
        ),
        digimons: ((digimons.data ?? []) as unknown as DigimonRow[]).filter(
          (row) => isNarrator || row.owner_id === userId,
        ),
      };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`digirole-files:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "digirole_tamers", filter: `game_id=eq.${gameId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "digirole_digimons",
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, queryClient]);

  const speciesQuery = useQuery({
    queryKey: ["digirole-species-list"],
    queryFn: async () => {
      const pages = await Promise.all(
        [0, 1000].map((from) =>
          table("digirole_species")
            .select(
              "id,name,stage,digi_attribute,fields,hp_base,base_attrs,signature_technique,image_url",
            )
            .order("name")
            .range(from, from + 999),
        ),
      );
      const error = pages.find((page) => page.error)?.error;
      if (error) throw error;
      return pages.flatMap((page) => page.data ?? []) as unknown as SpeciesRow[];
    },
    enabled: digimonOpen,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const filteredSpecies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const stageOrder = new Map<string, number>(
      [...DIGIROLE_STAGES, "Armor", "Hybrid", "Jogress"].map((stage, index) => [stage, index]),
    );
    const species = (speciesQuery.data ?? []).filter(
      (entry) =>
        !query ||
        `${entry.name} ${entry.stage} ${entry.digi_attribute}`
          .toLocaleLowerCase("pt-BR")
          .includes(query),
    );
    return species.sort(
      (left, right) =>
        (stageOrder.get(left.stage) ?? 99) - (stageOrder.get(right.stage) ?? 99) ||
        left.name.localeCompare(right.name, "pt-BR"),
    );
  }, [search, speciesQuery.data]);

  const selectedSpecies = speciesQuery.data?.find((species) => species.id === speciesId) ?? null;
  const selectedRoute = routesQuery.data?.find((route) => route.id === routeId) ?? null;
  const folders = useMemo(
    () =>
      [
        ...new Set([
          ...extraFolders,
          ...(filesQuery.data?.tamers ?? [])
            .map((entry) => entry.folder)
            .filter((folder): folder is string => !!folder),
          ...(filesQuery.data?.digimons ?? [])
            .map((entry) => entry.folder)
            .filter((folder): folder is string => !!folder),
        ]),
      ].sort((left, right) => left.localeCompare(right, "pt-BR")),
    [extraFolders, filesQuery.data],
  );
  const fileEntries = useMemo(() => {
    const query = fileSearch.trim().toLocaleLowerCase("pt-BR");
    return [
      ...(filesQuery.data?.tamers ?? []).map((row) => ({
        kind: "digirole_tamer" as const,
        row,
        label: row.name,
        subtitle: `Tamer · ${row.rank}`,
      })),
      ...(filesQuery.data?.digimons ?? []).map((row) => ({
        kind: "digirole_digimon" as const,
        row,
        label: row.nickname || row.species?.name || "Digimon",
        subtitle: `${row.species?.name || "Sem espécie"} · ${row.rank}`,
      })),
    ].filter(
      (entry) =>
        !query || `${entry.label} ${entry.subtitle}`.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [fileSearch, filesQuery.data]);

  function createFolder() {
    const folder = newFolder.trim().replace(/^\/+|\/+$/g, "");
    if (!folder) return;
    setExtraFolders((current) => (current.includes(folder) ? current : [...current, folder]));
    setNewFolder("");
  }

  async function moveFile(kind: DigiRoleWindow["kind"], id: string, folder: string | null) {
    const target = kind === "digirole_tamer" ? "digirole_tamers" : "digirole_digimons";
    const result = await table(target).update({ folder }).eq("id", id);
    if (result.error) return toast.error(messageOf(result.error));
    await queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
  }

  async function deleteFiles(keys: string[]) {
    if (!keys.length || !confirm(`Excluir ${keys.length} ficha${keys.length === 1 ? "" : "s"}?`))
      return;
    const tamerIds = keys
      .filter((key) => key.startsWith("digirole_tamer:"))
      .map((key) => key.split(":")[1]);
    const digimonIds = keys
      .filter((key) => key.startsWith("digirole_digimon:"))
      .map((key) => key.split(":")[1]);
    const [tamers, digimons] = await Promise.all([
      tamerIds.length
        ? table("digirole_tamers").delete().in("id", tamerIds)
        : Promise.resolve({ error: null }),
      digimonIds.length
        ? table("digirole_digimons").delete().in("id", digimonIds)
        : Promise.resolve({ error: null }),
    ]);
    if (tamers.error || digimons.error)
      return toast.error(messageOf(tamers.error || digimons.error));
    setSelected(new Set());
    setSelectMode(false);
    await queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
  }

  async function createRoute() {
    const name = routeName.trim();
    if (!name) return;
    const result = await table("digirole_routes")
      .insert({ game_id: gameId, owner_id: userId, name, species_ids: [] })
      .select("id")
      .single();
    if (result.error) return toast.error(messageOf(result.error));
    setRouteName("");
    setRouteId((result.data as unknown as { id: string }).id);
    await routesQuery.refetch();
  }

  async function toggleSpeciesInRoute() {
    if (!selectedRoute || !selectedSpecies) return;
    const contains = selectedRoute.species_ids.includes(selectedSpecies.id);
    const species_ids = contains
      ? selectedRoute.species_ids.filter((id) => id !== selectedSpecies.id)
      : [...selectedRoute.species_ids, selectedSpecies.id];
    const result = await table("digirole_routes")
      .update({ species_ids })
      .eq("id", selectedRoute.id);
    if (result.error) return toast.error(messageOf(result.error));
    await routesQuery.refetch();
  }

  const createTamer = useMutation({
    mutationFn: async () => {
      const attrs = defaultDigiRoleAttrs();
      const result = await table("digirole_tamers")
        .insert({
          game_id: gameId,
          owner_id: userId,
          name: "Novo Tamer",
          age: 13,
          attrs,
          skills: defaultDigiRoleSkills(),
          notoriety: defaultDigiRoleNotoriety(),
          hp_current: 3 + attrs.vitality,
          ds_current: 2 + attrs.spirit,
        })
        .select("id,name")
        .single();
      if (result.error) throw result.error;
      return result.data as unknown as { id: string; name: string };
    },
    onSuccess: (tamer) => {
      void queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
      onOpen({ kind: "digirole_tamer", id: tamer.id, title: tamer.name });
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  const createDigimon = useMutation({
    mutationFn: async () => {
      if (!selectedSpecies) throw new Error("Escolha uma espécie.");
      const attrs = { ...defaultDigiRoleAttrs(), ...selectedSpecies.base_attrs };
      const hp = digiRoleDigimonHpMax(selectedSpecies.hp_base, attrs);
      const ds = digiRoleDigimonDsMax(attrs, 1);
      const resolvedImage =
        selectedSpecies.image_url || (await fetchDigiApiImage(selectedSpecies.name));
      if (resolvedImage && !selectedSpecies.image_url) {
        await table("digirole_species")
          .update({ image_url: resolvedImage })
          .eq("id", selectedSpecies.id);
      }
      const result = await table("digirole_digimons")
        .insert({
          game_id: gameId,
          owner_id: userId,
          species_id: selectedSpecies.id,
          nickname: nickname.trim() || null,
          rank: selectedSpecies.stage,
          attrs,
          skills: defaultDigiRoleSkills(),
          hp_current: hp,
          ds_current: ds,
          image_url: resolvedImage,
        })
        .select("id,nickname")
        .single();
      if (result.error) throw result.error;
      const digimon = result.data as unknown as { id: string; nickname: string | null };
      if (selectedSpecies.signature_technique) {
        const techniqueId = await fetchDigiRoleSignatureTechniqueId({
          speciesId: selectedSpecies.id,
          signatureName: selectedSpecies.signature_technique,
          speciesName: selectedSpecies.name,
        });
        if (techniqueId) {
          await table("digirole_digimon_techniques").insert({
            digimon_id: digimon.id,
            technique_id: techniqueId,
            source: "signature",
          });
        }
      }
      return digimon;
    },
    onSuccess: (digimon) => {
      setDigimonOpen(false);
      setSpeciesId("");
      setNickname("");
      setSearch("");
      void queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
      onOpen({
        kind: "digirole_digimon",
        id: digimon.id,
        title: digimon.nickname || selectedSpecies?.name || "Digimon",
      });
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  function dragPayload(
    kind: DigiRoleWindow["kind"],
    row: TamerRow | DigimonRow,
  ): DragCharacterPayload {
    const species = "species" in row ? row.species : null;
    return {
      kind,
      id: row.id,
      label: "name" in row ? row.name : row.nickname || species?.name || "Digimon",
      imageUrl:
        "image_hidden" in row && row.image_hidden
          ? null
          : row.image_url || species?.image_url || null,
      ownerId: row.owner_id,
    };
  }

  function FileButton({
    window,
    payload,
    subtitle,
    folder,
  }: {
    window: DigiRoleWindow;
    payload: DragCharacterPayload;
    subtitle: string;
    folder: string | null;
  }) {
    const key = `${window.kind}:${window.id}`;
    return (
      <div className="flex items-center gap-1 rounded-md border border-border bg-background pr-1 hover:bg-accent">
        {selectMode && (
          <Checkbox
            className="ml-2"
            checked={selected.has(key)}
            onCheckedChange={() =>
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              })
            }
          />
        )}
        <button
          type="button"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          onMouseDown={(event) => {
            if (!selectMode) pointerDrag.beginMouse(event, payload);
          }}
          onPointerDown={(event) => {
            if (selectMode || event.pointerType === "mouse") return;
            pointerDrag.begin(event, payload);
          }}
          onClick={() => {
            if (pointerDrag.consumeSuppressedClick()) return;
            if (selectMode)
              return setSelected((current) => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
              });
            onOpen(window);
          }}
          style={{ touchAction: "none", userSelect: "none" }}
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
        >
          {payload.imageUrl ? (
            <img
              src={transparentDigiRoleImageUrl(payload.imageUrl) ?? payload.imageUrl}
              alt=""
              className="h-9 w-9 shrink-0 object-contain"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted text-xs font-black">
              {payload.label.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold">{payload.label}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{subtitle}</span>
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{payload.label}</DropdownMenuLabel>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Mover para pasta</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => void moveFile(window.kind, window.id, null)}>
                  Sem pasta
                </DropdownMenuItem>
                {folders.map((target) => (
                  <DropdownMenuItem
                    key={target}
                    disabled={folder === target}
                    onClick={() => void moveFile(window.kind, window.id, target)}
                  >
                    {target}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => void deleteFiles([key])}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const migrationMissing = filesQuery.error && /digirole_/i.test(messageOf(filesQuery.error));

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">Arquivos DigiRole</h3>
          <p className="text-[10px] text-muted-foreground">Arraste uma ficha para o mapa.</p>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant={selectMode ? "secondary" : "outline"}
            title="Selecionar fichas"
            onClick={() => {
              setSelectMode((current) => !current);
              setSelected(new Set());
            }}
          >
            {selectMode ? <X className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={createTamer.isPending}
            onClick={() => createTamer.mutate()}
          >
            <User className="mr-1 h-3.5 w-3.5" /> Tamer
          </Button>
          <Button size="sm" onClick={() => setDigimonOpen(true)}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Digimon
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={fileSearch}
          onChange={(event) => setFileSearch(event.target.value)}
          placeholder="Procurar fichas..."
          className="pl-9"
        />
      </div>
      <div className="flex gap-1.5">
        <Input
          value={newFolder}
          onChange={(event) => setNewFolder(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") createFolder();
          }}
          placeholder="Nova pasta"
          className="h-8"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 shrink-0"
          disabled={!newFolder.trim()}
          title="Criar pasta"
          onClick={createFolder}
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>
      {selectMode && (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-2 py-1.5">
          <span className="text-[10px] font-bold">{selected.size} selecionada(s)</span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7"
            disabled={!selected.size}
            onClick={() => void deleteFiles([...selected])}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
          </Button>
        </div>
      )}

      {migrationMissing && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          O banco DigiRole ainda não foi preparado. Aplique as migrations DigiRole até
          `20260902120000`.
        </div>
      )}

      <div className="min-h-0 max-h-[calc(100vh-22rem)] space-y-2 overflow-y-auto pr-1">
        {[null, ...folders].map((folder) => {
          const key = folder ?? "__unfiled__";
          const entries = fileEntries.filter((entry) => entry.row.folder === folder);
          if (!folder && !entries.length) return null;
          return (
            <section key={key} className="rounded-md border border-border/70 p-1.5">
              <button
                type="button"
                className="flex w-full items-center gap-1 px-1 py-1 text-left"
                onClick={() => setCollapsed((current) => ({ ...current, [key]: !current[key] }))}
              >
                {collapsed[key] ? (
                  <ChevronRight className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <span className="min-w-0 flex-1 truncate text-[10px] font-black uppercase text-muted-foreground">
                  {folder ?? "Sem pasta"}
                </span>
                <Badge variant="secondary" className="h-5 px-1.5 text-[9px]">
                  {entries.length}
                </Badge>
              </button>
              {!collapsed[key] && (
                <div className="mt-1 space-y-1">
                  {entries.map((entry) => (
                    <FileButton
                      key={`${entry.kind}:${entry.row.id}`}
                      window={{ kind: entry.kind, id: entry.row.id, title: entry.label }}
                      payload={dragPayload(entry.kind, entry.row)}
                      subtitle={entry.subtitle}
                      folder={entry.row.folder}
                    />
                  ))}
                  {entries.length === 0 && (
                    <p className="px-2 py-2 text-[10px] text-muted-foreground">Pasta vazia.</p>
                  )}
                </div>
              )}
            </section>
          );
        })}
        {!filesQuery.isLoading && fileEntries.length === 0 && (
          <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
            Nenhuma ficha encontrada.
          </p>
        )}
      </div>

      <Dialog open={digimonOpen} onOpenChange={setDigimonOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Criar Digimon</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label>Espécie</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Procurar entre 455 espécies..."
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Select value={speciesId} onValueChange={setSpeciesId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Escolha a espécie" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto">
                    {filteredSpecies.map((species) => (
                      <SelectItem key={species.id} value={species.id}>
                        {species.name} · {species.stage} · {species.digi_attribute}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  title="Escolher espécie aleatória"
                  onClick={() => {
                    const routeSpecies = selectedRoute
                      ? filteredSpecies.filter((species) =>
                          selectedRoute.species_ids.includes(species.id),
                        )
                      : filteredSpecies;
                    if (!routeSpecies.length)
                      return toast.error("Esta rota não possui espécies disponíveis.");
                    setSpeciesId(routeSpecies[Math.floor(Math.random() * routeSpecies.length)].id);
                  }}
                >
                  <Dices className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="digirole-nickname">Apelido (opcional)</Label>
              <Input
                id="digirole-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
              />
            </div>
            {selectedSpecies && (
              <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-xs">
                <div>
                  <span className="block text-[10px] text-muted-foreground">Estágio</span>
                  <strong>{selectedSpecies.stage}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-muted-foreground">Atributo</span>
                  <strong>{selectedSpecies.digi_attribute}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-muted-foreground">Fields</span>
                  <strong>{selectedSpecies.fields.join(", ") || "Neutra"}</strong>
                </div>
              </div>
            )}
            {isNarrator && (
              <section className="rounded-md border border-border p-3">
                <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Rotas</h3>
                <div className="flex gap-2">
                  <Input
                    value={routeName}
                    onChange={(event) => setRouteName(event.target.value)}
                    placeholder="Nome da nova rota"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!routeName.trim()}
                    onClick={() => void createRoute()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2 flex gap-2">
                  <Select value={routeId} onValueChange={setRouteId}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecionar rota preparada" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 overflow-y-auto">
                      {(routesQuery.data ?? []).map((route) => (
                        <SelectItem key={route.id} value={route.id}>
                          {route.name} · {route.species_ids.length}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!selectedRoute || !selectedSpecies}
                    onClick={() => void toggleSpeciesInRoute()}
                  >
                    {selectedRoute?.species_ids.includes(speciesId) ? "Remover" : "Adicionar"}
                  </Button>
                </div>
                {selectedRoute && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {selectedRoute.species_ids
                      .map((id) => speciesQuery.data?.find((species) => species.id === id)?.name)
                      .filter(Boolean)
                      .join(", ") || "Nenhum Digimon nesta rota."}
                  </p>
                )}
              </section>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={!selectedSpecies || createDigimon.isPending}
              onClick={() => createDigimon.mutate()}
            >
              <Dices className="mr-1 h-4 w-4" /> Criar Digimon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CharacterDragPreview preview={pointerDrag.preview} />
    </div>
  );
}
