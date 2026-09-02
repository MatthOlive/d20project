import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dices, Search, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { DRAG_MIME, type DragCharacterPayload } from "@/components/MapBoard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
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
  onOpen,
}: {
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onOpen: (window: DigiRoleWindow) => void;
}) {
  const queryClient = useQueryClient();
  const [tamerOpen, setTamerOpen] = useState(false);
  const [digimonOpen, setDigimonOpen] = useState(false);
  const [tamerName, setTamerName] = useState("");
  const [tamerAge, setTamerAge] = useState("13");
  const [speciesId, setSpeciesId] = useState("");
  const [nickname, setNickname] = useState("");
  const [search, setSearch] = useState("");

  const filesQuery = useQuery({
    queryKey: ["digirole-files", gameId],
    queryFn: async () => {
      const [tamers, digimons] = await Promise.all([
        table("digirole_tamers").select("id,name,owner_id,image_url,rank").eq("game_id", gameId).order("created_at"),
        table("digirole_digimons")
          .select("id,nickname,owner_id,image_url,rank,species:species_id(id,name,stage,digi_attribute,fields,hp_base,base_attrs,signature_technique,image_url)")
          .eq("game_id", gameId)
          .order("created_at"),
      ]);
      if (tamers.error) throw tamers.error;
      if (digimons.error) throw digimons.error;
      return {
        tamers: (tamers.data ?? []) as unknown as TamerRow[],
        digimons: (digimons.data ?? []) as unknown as DigimonRow[],
      };
    },
  });

  const speciesQuery = useQuery({
    queryKey: ["digirole-species-list"],
    queryFn: async () => {
      const result = await table("digirole_species")
        .select("id,name,stage,digi_attribute,fields,hp_base,base_attrs,signature_technique,image_url")
        .order("name")
        .limit(1000);
      if (result.error) throw result.error;
      return (result.data ?? []) as unknown as SpeciesRow[];
    },
    enabled: digimonOpen,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const filteredSpecies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return speciesQuery.data ?? [];
    return (speciesQuery.data ?? []).filter((species) =>
      `${species.name} ${species.stage} ${species.digi_attribute}`.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [search, speciesQuery.data]);

  const selectedSpecies = speciesQuery.data?.find((species) => species.id === speciesId) ?? null;

  const createTamer = useMutation({
    mutationFn: async () => {
      const name = tamerName.trim();
      if (!name) throw new Error("Digite o nome do Tamer.");
      const attrs = defaultDigiRoleAttrs();
      const result = await table("digirole_tamers").insert({
        game_id: gameId,
        owner_id: userId,
        name,
        age: Math.max(0, Number.parseInt(tamerAge, 10) || 0),
        attrs,
        skills: defaultDigiRoleSkills(),
        notoriety: defaultDigiRoleNotoriety(),
        hp_current: 3 + attrs.vitality,
        ds_current: 2 + attrs.spirit,
      }).select("id,name").single();
      if (result.error) throw result.error;
      return result.data as unknown as { id: string; name: string };
    },
    onSuccess: (tamer) => {
      setTamerOpen(false);
      setTamerName("");
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
      const result = await table("digirole_digimons").insert({
        game_id: gameId,
        owner_id: userId,
        species_id: selectedSpecies.id,
        nickname: nickname.trim() || null,
        rank: selectedSpecies.stage,
        attrs,
        skills: defaultDigiRoleSkills(),
        hp_current: hp,
        ds_current: ds,
      }).select("id,nickname").single();
      if (result.error) throw result.error;
      const digimon = result.data as unknown as { id: string; nickname: string | null };
      if (selectedSpecies.signature_technique) {
        const technique = await table("digirole_techniques")
          .select("id")
          .eq("name", selectedSpecies.signature_technique)
          .eq("origin", selectedSpecies.name)
          .limit(1)
          .maybeSingle();
        if (technique.data) {
          await table("digirole_digimon_techniques").insert({
            digimon_id: digimon.id,
            technique_id: (technique.data as unknown as { id: string }).id,
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

  function dragPayload(kind: DigiRoleWindow["kind"], row: TamerRow | DigimonRow): DragCharacterPayload {
    const species = "species" in row ? row.species : null;
    return {
      kind,
      id: row.id,
      label: "name" in row ? row.name : row.nickname || species?.name || "Digimon",
      imageUrl: row.image_url || species?.image_url || null,
      ownerId: row.owner_id,
    };
  }

  function FileButton({ window, payload, subtitle }: { window: DigiRoleWindow; payload: DragCharacterPayload; subtitle: string }) {
    return (
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
          event.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => onOpen(window)}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-2 text-left hover:bg-accent"
      >
        {payload.imageUrl ? (
          <img src={payload.imageUrl} alt="" className="h-9 w-9 shrink-0 object-contain" />
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
    );
  }

  const migrationMissing = filesQuery.error && /digirole_/i.test(messageOf(filesQuery.error));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">Arquivos DigiRole</h3>
          <p className="text-[10px] text-muted-foreground">Arraste uma ficha para o mapa.</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setTamerOpen(true)}>
            <User className="mr-1 h-3.5 w-3.5" /> Tamer
          </Button>
          <Button size="sm" onClick={() => setDigimonOpen(true)}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Digimon
          </Button>
        </div>
      </div>

      {migrationMissing && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          O banco DigiRole ainda não foi preparado. Aplique as migrations `20260901120000` e `20260901121000`.
        </div>
      )}

      <section className="space-y-1.5">
        <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Tamers</h4>
        {(filesQuery.data?.tamers ?? []).map((tamer) => (
          <FileButton
            key={tamer.id}
            window={{ kind: "digirole_tamer", id: tamer.id, title: tamer.name }}
            payload={dragPayload("digirole_tamer", tamer)}
            subtitle={`Tamer · ${tamer.rank}`}
          />
        ))}
        {!filesQuery.isLoading && (filesQuery.data?.tamers.length ?? 0) === 0 && (
          <p className="px-2 py-1 text-[11px] text-muted-foreground">Nenhum Tamer criado.</p>
        )}
      </section>

      <section className="space-y-1.5">
        <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Digimon</h4>
        {(filesQuery.data?.digimons ?? []).map((digimon) => (
          <FileButton
            key={digimon.id}
            window={{
              kind: "digirole_digimon",
              id: digimon.id,
              title: digimon.nickname || digimon.species?.name || "Digimon",
            }}
            payload={dragPayload("digirole_digimon", digimon)}
            subtitle={`${digimon.species?.name || "Sem espécie"} · ${digimon.rank}`}
          />
        ))}
        {!filesQuery.isLoading && (filesQuery.data?.digimons.length ?? 0) === 0 && (
          <p className="px-2 py-1 text-[11px] text-muted-foreground">Nenhum Digimon criado.</p>
        )}
      </section>

      <Dialog open={tamerOpen} onOpenChange={setTamerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar Tamer</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="space-y-1.5">
              <Label htmlFor="digirole-tamer-name">Nome</Label>
              <Input id="digirole-tamer-name" value={tamerName} onChange={(event) => setTamerName(event.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="digirole-tamer-age">Idade</Label>
              <Input id="digirole-tamer-age" type="number" min={0} value={tamerAge} onChange={(event) => setTamerAge(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!tamerName.trim() || createTamer.isPending} onClick={() => createTamer.mutate()}>
              Criar Tamer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={digimonOpen} onOpenChange={setDigimonOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader><DialogTitle>Criar Digimon</DialogTitle></DialogHeader>
          <div className="space-y-3 overflow-hidden">
            <div className="space-y-1.5">
              <Label>Espécie</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Procurar entre 455 espécies..." className="pl-9" />
              </div>
              <Select value={speciesId} onValueChange={setSpeciesId}>
                <SelectTrigger><SelectValue placeholder="Escolha a espécie" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {filteredSpecies.map((species) => (
                    <SelectItem key={species.id} value={species.id}>
                      {species.name} · {species.stage} · {species.digi_attribute}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="digirole-nickname">Apelido (opcional)</Label>
              <Input id="digirole-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} />
            </div>
            {selectedSpecies && (
              <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-xs">
                <div><span className="block text-[10px] text-muted-foreground">Estágio</span><strong>{selectedSpecies.stage}</strong></div>
                <div><span className="block text-[10px] text-muted-foreground">Atributo</span><strong>{selectedSpecies.digi_attribute}</strong></div>
                <div><span className="block text-[10px] text-muted-foreground">Fields</span><strong>{selectedSpecies.fields.join(", ") || "Neutra"}</strong></div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button disabled={!selectedSpecies || createDigimon.isPending} onClick={() => createDigimon.mutate()}>
              <Dices className="mr-1 h-4 w-4" /> Criar Digimon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
