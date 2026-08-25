import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Bot,
  Box,
  CircleDot,
  Clock3,
  Copy,
  Cpu,
  FileClock,
  Gauge,
  HardDrive,
  Map as MapIcon,
  PackageOpen,
  Plus,
  Radio,
  Shield,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChatPanel } from "@/components/ChatPanel";
import { OnlinePresence } from "@/components/OnlinePresence";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LancerContentManager } from "@/components/lancer/LancerContentManager";
import { LancerEntityEditor } from "@/components/lancer/LancerEntityEditor";
import { LancerGmWorkspace } from "@/components/lancer/LancerGmWorkspace";
import { LancerHexMap } from "@/components/lancer/LancerHexMap";
import {
  createEmptyLancerBuild,
  createInitialLancerState,
} from "@/lib/lancer/rules-engine";
import type {
  LancerCampaign,
  LancerCompendiumItem,
  LancerContentPack,
  LancerEntity,
  LancerEntityKind,
  LancerGameEvent,
  LancerResourceState,
} from "@/lib/lancer/types";

type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };

type LancerCampaignWorkspaceProps = {
  gameId: string;
  gameName: string;
  userId: string;
  isNarrator: boolean;
  aiNarrator: boolean;
  inviteUrl: string;
};

const ENTITY_LABELS: Record<LancerEntityKind, string> = {
  pilot: "Piloto",
  mech: "Mech",
  npc: "NPC",
  object: "Objeto",
  deployable: "Deployable",
};

const ENTITY_ICONS: Record<LancerEntityKind, typeof UserRound> = {
  pilot: UserRound,
  mech: Bot,
  npc: Cpu,
  object: Box,
  deployable: Radio,
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eventLabel(event: LancerGameEvent): string {
  if (event.event_type === "entity_created") {
    const name = typeof event.payload.name === "string" ? event.payload.name : "Entidade";
    const kind = typeof event.payload.entityType === "string" ? event.payload.entityType : "entity";
    return `${ENTITY_LABELS[kind as LancerEntityKind] ?? "Entidade"} criado: ${name}`;
  }
  if (event.event_type === "dice_roll") {
    return `${String(event.payload.entityName ?? "Entidade")} rolou ${String(event.payload.rollType ?? "check")}: ${String(event.payload.total ?? "--")}`;
  }
  if (event.event_type === "content_pack_imported") {
    return `LCP importado: ${String(event.payload.name ?? "pacote")} (${String(event.payload.items ?? 0)} itens)`;
  }
  if (event.event_type === "build_updated") return "Build recalculada e salva";
  if (event.event_type === "token_placed") return "Entidade posicionada no mapa";
  if (event.event_type === "token_moved") {
    return `Movimento confirmado · custo ${String(event.payload.cost ?? "--")}`;
  }
  return event.event_type.replaceAll("_", " ");
}

function resourceEntries(entity: LancerEntity): [string, LancerResourceState][] {
  return Object.entries(entity.current_state.resources).filter(
    (entry): entry is [string, LancerResourceState] => !!entry[1],
  );
}

function statValue(entity: LancerEntity, key: string): number | null {
  const value = entity.current_state.stats[key];
  return typeof value === "number" ? value : null;
}

function EntityRow({ entity, onOpen }: { entity: LancerEntity; onOpen: () => void }) {
  const Icon = ENTITY_ICONS[entity.entity_type];
  const resources = resourceEntries(entity);
  return (
    <article className="grid gap-4 border-b border-border/70 py-4 last:border-b-0 md:grid-cols-[minmax(0,1.2fr)_minmax(16rem,1fr)]">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black uppercase">{entity.callsign || entity.name}</h3>
            <Badge variant="outline" className="rounded-sm text-[10px] uppercase">
              {ENTITY_LABELS[entity.entity_type]}
            </Badge>
            <span className="text-[10px] text-muted-foreground">rev. {entity.revision}</span>
          </div>
          {entity.callsign && <p className="mt-0.5 truncate text-xs text-muted-foreground">{entity.name}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {resources.length > 0 ? (
              resources.map(([key, value]) => (
                <div key={key} className="min-w-20 border-l-2 border-amber-400/60 pl-2">
                  <div className="text-[9px] font-bold uppercase text-muted-foreground">{key}</div>
                  <div className="font-mono text-sm font-black tabular-nums">
                    {value.current}<span className="text-muted-foreground">/{value.max}</span>
                  </div>
                </div>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">Estado de combate ainda não configurado.</span>
            )}
          </div>
          <Button size="sm" variant="outline" className="mt-3 h-7" onClick={onOpen}>
            <Wrench className="mr-1 h-3.5 w-3.5" /> Abrir ficha
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 self-center">
        {entity.entity_type === "pilot" ? (
          <>
            <Stat label="Evasion" value={statValue(entity, "evasion")} />
            <Stat label="E-Defense" value={statValue(entity, "eDefense")} />
            <Stat label="Speed" value={statValue(entity, "speed")} />
          </>
        ) : entity.entity_type === "mech" ? (
          <>
            <Stat label="Armor" value={statValue(entity, "armor")} />
            <Stat label="Evasion" value={statValue(entity, "evasion")} />
            <Stat label="Sensors" value={statValue(entity, "sensors")} />
          </>
        ) : (
          <div className="col-span-3 border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Estado canônico preparado para composição posterior.
          </div>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="border border-border/80 bg-background/50 px-2 py-2 text-center">
      <div className="truncate text-[9px] font-bold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-black tabular-nums">{value ?? "--"}</div>
    </div>
  );
}

export function LancerCampaignWorkspace({
  gameId,
  gameName,
  userId,
  isNarrator,
  aiNarrator,
  inviteUrl,
}: LancerCampaignWorkspaceProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [entityType, setEntityType] = useState<LancerEntityKind>("pilot");
  const [entityName, setEntityName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const channelId = useRef(Math.random().toString(36).slice(2));

  const campaignQuery = useQuery({
    queryKey: ["lancer-campaign", gameId],
    queryFn: async () => {
      const query = supabase.from("lancer_campaigns" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<RpcResult<LancerCampaign>>;
          };
        };
      };
      const { data, error } = await query.select("*").eq("game_id", gameId).maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  const entitiesQuery = useQuery({
    queryKey: ["lancer-entities", gameId],
    queryFn: async () => {
      const query = supabase.from("lancer_entities" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            order: (column: string, options: { ascending: boolean }) => Promise<RpcResult<LancerEntity[]>>;
          };
        };
      };
      const { data, error } = await query.select("*").eq("game_id", gameId).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const eventsQuery = useQuery({
    queryKey: ["lancer-events", gameId],
    queryFn: async () => {
      const query = supabase.from("lancer_game_events" as never) as never as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            order: (column: string, options: { ascending: boolean }) => {
              limit: (count: number) => Promise<RpcResult<LancerGameEvent[]>>;
            };
          };
        };
      };
      const { data, error } = await query
        .select("id,game_id,entity_id,actor_user_id,transaction_id,event_type,payload,created_at")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const packsQuery = useQuery({
    queryKey: ["lancer-content-packs", gameId],
    queryFn: async () => {
      const query = supabase.from("lancer_content_packs" as never) as never as {
        select: (columns: string) => { eq: (column: string, value: string) => { order: (column: string, options: { ascending: boolean }) => Promise<RpcResult<LancerContentPack[]>> } };
      };
      const { data, error } = await query.select("*").eq("game_id", gameId).order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const compendiumQuery = useQuery({
    queryKey: ["lancer-compendium", gameId],
    queryFn: async () => {
      const query = supabase.from("lancer_compendium_items" as never) as never as {
        select: (columns: string) => { or: (filter: string) => { order: (column: string, options: { ascending: boolean }) => Promise<RpcResult<LancerCompendiumItem[]>> } };
      };
      const { data, error } = await query.select("*").or(`game_id.eq.${gameId},game_id.is.null`).order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`lancer-foundation:${gameId}:${channelId.current}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "lancer_entities",
        filter: `game_id=eq.${gameId}`,
      }, () => void queryClient.invalidateQueries({ queryKey: ["lancer-entities", gameId] }))
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "lancer_game_events",
        filter: `game_id=eq.${gameId}`,
      }, () => void queryClient.invalidateQueries({ queryKey: ["lancer-events", gameId] }))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "lancer_content_packs",
        filter: `game_id=eq.${gameId}`,
      }, () => void queryClient.invalidateQueries({ queryKey: ["lancer-content-packs", gameId] }))
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "lancer_compendium_items",
        filter: `game_id=eq.${gameId}`,
      }, () => void queryClient.invalidateQueries({ queryKey: ["lancer-compendium", gameId] }))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, queryClient]);

  const createEntity = useMutation({
    mutationFn: async () => {
      const name = entityName.trim();
      if (!name) throw new Error("Informe o nome da entidade.");
      const { data, error } = await (supabase.rpc("create_lancer_entity" as never, {
        p_game_id: gameId,
        p_entity_type: entityType,
        p_name: name,
        p_callsign: callsign.trim() || null,
        p_owner_id: entityType === "npc" || entityType === "object" || entityType === "deployable" ? null : userId,
        p_current_state: createInitialLancerState(entityType),
        p_build_state: createEmptyLancerBuild(),
      } as never) as unknown as Promise<RpcResult<LancerEntity>>);
      if (error) throw error;
      if (!data) throw new Error("O banco não retornou a entidade criada.");
      return data;
    },
    onSuccess: () => {
      setCreateOpen(false);
      setEntityName("");
      setCallsign("");
      setEntityType("pilot");
      void queryClient.invalidateQueries({ queryKey: ["lancer-entities", gameId] });
      void queryClient.invalidateQueries({ queryKey: ["lancer-events", gameId] });
      toast.success("Entidade LANCER criada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const entities = entitiesQuery.data ?? [];
  const counts = useMemo(() => ({
    pilots: entities.filter((entity) => entity.entity_type === "pilot").length,
    mechs: entities.filter((entity) => entity.entity_type === "mech").length,
    npcs: entities.filter((entity) => entity.entity_type === "npc").length,
  }), [entities]);
  const usableCompendiumItems = useMemo(() => {
    const enabledPackIds = new Set((packsQuery.data ?? []).filter((pack) => pack.enabled).map((pack) => pack.id));
    return (compendiumQuery.data ?? []).filter((item) => !item.pack_id || enabledPackIds.has(item.pack_id));
  }, [compendiumQuery.data, packsQuery.data]);
  const databaseError = campaignQuery.error || entitiesQuery.error || eventsQuery.error || packsQuery.error || compendiumQuery.error;
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const refreshContent = () => {
    void queryClient.invalidateQueries({ queryKey: ["lancer-content-packs", gameId] });
    void queryClient.invalidateQueries({ queryKey: ["lancer-compendium", gameId] });
    void queryClient.invalidateQueries({ queryKey: ["lancer-events", gameId] });
  };

  return (
    <div className="h-screen overflow-hidden bg-[#090d12] text-foreground">
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
        <header className="border-b border-cyan-300/20 bg-[#0c1219] px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="icon" variant="outline" className="h-9 w-9 rounded-md" title="Voltar ao dashboard">
              <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase text-cyan-300">
                <CircleDot className="h-3 w-3" /> LANCER // Campaign Network
              </div>
              <h1 className="truncate text-lg font-black uppercase md:text-xl">{gameName}</h1>
            </div>
            <Badge variant="outline" className="rounded-sm border-amber-400/40 text-amber-300">
              {isNarrator ? "GM" : "Pilot"}
            </Badge>
            {isNarrator && inviteUrl && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteUrl);
                  toast.success("Convite copiado.");
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Convite
              </Button>
            )}
          </div>
        </header>

        <div className="grid min-h-0 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <main className="min-h-0 overflow-hidden">
            <Tabs defaultValue="overview" className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
              <TabsList className="mx-4 mt-4 grid h-10 grid-cols-7 rounded-md border border-border bg-[#101720] p-1 md:mx-6 md:w-[61rem]">
                <TabsTrigger value="overview" className="gap-1.5 rounded-sm">
                  <Gauge className="h-4 w-4" /> <span className="hidden sm:inline">Overview</span>
                </TabsTrigger>
                <TabsTrigger value="entities" className="gap-1.5 rounded-sm">
                  <HardDrive className="h-4 w-4" /> <span className="hidden sm:inline">Entities</span>
                </TabsTrigger>
                <TabsTrigger value="map" className="gap-1.5 rounded-sm">
                  <MapIcon className="h-4 w-4" /> <span className="hidden sm:inline">Hex Map</span>
                </TabsTrigger>
                <TabsTrigger value="compendium" className="gap-1.5 rounded-sm">
                  <PackageOpen className="h-4 w-4" /> <span className="hidden sm:inline">Compendium</span>
                </TabsTrigger>
                <TabsTrigger value="builds" className="gap-1.5 rounded-sm">
                  <Wrench className="h-4 w-4" /> <span className="hidden sm:inline">Builds</span>
                </TabsTrigger>
                <TabsTrigger value="gm" className="gap-1.5 rounded-sm">
                  <Shield className="h-4 w-4" /> <span className="hidden sm:inline">GM</span>
                </TabsTrigger>
                <TabsTrigger value="events" className="gap-1.5 rounded-sm">
                  <FileClock className="h-4 w-4" /> <span className="hidden sm:inline">Events</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-0 min-h-0 overflow-auto p-4 md:p-6">
                {databaseError ? (
                  <DatabaseError error={databaseError} />
                ) : (
                  <div className="mx-auto max-w-6xl space-y-8">
                    <section className="grid border-y border-border bg-[#0e151d] sm:grid-cols-3">
                      <Metric label="Pilotos" value={counts.pilots} icon={UserRound} />
                      <Metric label="Mechs" value={counts.mechs} icon={Bot} />
                      <Metric label="NPCs" value={counts.npcs} icon={Cpu} />
                    </section>

                    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
                      <div>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h2 className="text-xs font-black uppercase text-muted-foreground">Roster</h2>
                          <Button size="sm" onClick={() => setCreateOpen(true)}>
                            <Plus className="mr-1.5 h-4 w-4" /> Criar entidade
                          </Button>
                        </div>
                        <div className="border-t border-border">
                          {entities.length > 0 ? (
                            entities.slice(0, 5).map((entity) => <EntityRow key={entity.id} entity={entity} onOpen={() => setSelectedEntityId(entity.id)} />)
                          ) : (
                            <EmptyState icon={Users} label="Nenhuma entidade na campanha" />
                          )}
                        </div>
                      </div>

                      <aside className="border-l-2 border-cyan-400/30 bg-[#0e151d] p-4">
                        <h2 className="text-xs font-black uppercase text-cyan-300">Campaign State</h2>
                        <dl className="mt-4 space-y-3 text-xs">
                          <StateLine label="Rules" value={campaignQuery.data?.rules_version ?? "core"} />
                          <StateLine label="Auto damage" value={campaignQuery.data?.auto_apply_damage ? "ON" : "OFF"} />
                          <StateLine label="Entity schema" value="v1" />
                          <StateLine label="Realtime" value="SYNC" accent />
                        </dl>
                      </aside>
                    </section>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="entities" className="mt-0 min-h-0 overflow-hidden p-4 md:p-6">
                <div className="mx-auto flex h-full max-w-6xl flex-col">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-black uppercase">Game Entities</h2>
                      <p className="text-xs text-muted-foreground">{entities.length} registro(s)</p>
                    </div>
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                      <Plus className="mr-1.5 h-4 w-4" /> Criar entidade
                    </Button>
                  </div>
                  <ScrollArea className="min-h-0 flex-1 border-t border-border pr-3">
                    {entities.length > 0
                      ? entities.map((entity) => <EntityRow key={entity.id} entity={entity} onOpen={() => setSelectedEntityId(entity.id)} />)
                      : <EmptyState icon={HardDrive} label="Nenhuma entidade na campanha" />}
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="map" className="mt-0 min-h-0 overflow-hidden">
                <LancerHexMap
                  gameId={gameId}
                  userId={userId}
                  isNarrator={isNarrator}
                  entities={entities}
                  items={usableCompendiumItems}
                  autoApplyDamage={campaignQuery.data?.auto_apply_damage ?? true}
                  onOpenEntity={setSelectedEntityId}
                />
              </TabsContent>

              <TabsContent value="compendium" className="mt-0 min-h-0 overflow-hidden p-4 md:p-6">
                <LancerContentManager
                  gameId={gameId}
                  isNarrator={isNarrator}
                  packs={packsQuery.data ?? []}
                  items={compendiumQuery.data ?? []}
                  onChanged={refreshContent}
                />
              </TabsContent>

              <TabsContent value="builds" className="mt-0 min-h-0 overflow-hidden p-4 md:p-6">
                <div className="mx-auto flex h-full max-w-6xl flex-col">
                  <div className="mb-3">
                    <h2 className="text-sm font-black uppercase">Automated Character Engine</h2>
                    <p className="text-xs text-muted-foreground">Selecione uma entidade para editar; frames e equipamentos vêm do compêndio ativo.</p>
                  </div>
                  <ScrollArea className="min-h-0 flex-1 border-t border-border pr-3">
                    {entities.filter((entity) => entity.entity_type === "pilot" || entity.entity_type === "mech").map((entity) => (
                      <EntityRow key={entity.id} entity={entity} onOpen={() => setSelectedEntityId(entity.id)} />
                    ))}
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="gm" className="mt-0 min-h-0 overflow-hidden p-4 md:p-6">
                <LancerGmWorkspace
                  gameId={gameId}
                  userId={userId}
                  isNarrator={isNarrator}
                  entities={entities}
                  items={usableCompendiumItems}
                />
              </TabsContent>

              <TabsContent value="events" className="mt-0 min-h-0 overflow-hidden p-4 md:p-6">
                <div className="mx-auto flex h-full max-w-5xl flex-col">
                  <h2 className="mb-3 text-sm font-black uppercase">Game Events</h2>
                  <ScrollArea className="min-h-0 flex-1 border-t border-border pr-3">
                    {(eventsQuery.data ?? []).length > 0 ? (
                      <ol>
                        {(eventsQuery.data ?? []).map((event) => (
                          <li key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border/70 py-3">
                            <Activity className="mt-0.5 h-4 w-4 text-amber-300" />
                            <div>
                              <div className="text-xs font-bold uppercase">{eventLabel(event)}</div>
                              <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock3 className="h-3 w-3" /> {formatDate(event.created_at)} · #{event.id}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <EmptyState icon={FileClock} label="Nenhum evento registrado" />
                    )}
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>
          </main>

          <aside className="hidden min-h-0 border-l border-border bg-[#0c1219] xl:flex xl:flex-col">
            <div className="shrink-0 border-b border-border p-3">
              <OnlinePresence gameId={gameId} userId={userId} isNarrator={isNarrator} />
            </div>
            <div className="min-h-0 flex-1">
              <ChatPanel gameId={gameId} userId={userId} aiNarrator={aiNarrator} isGameOwner={isNarrator} />
            </div>
          </aside>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-md border-cyan-400/25 bg-[#0c1219]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 uppercase">
              <Plus className="h-4 w-4 text-cyan-300" /> Nova entidade LANCER
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={entityType} onValueChange={(value) => setEntityType(value as LancerEntityKind)}>
                <SelectTrigger className="rounded-md"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pilot">Piloto</SelectItem>
                  <SelectItem value="mech">Mech</SelectItem>
                  {isNarrator && <SelectItem value="npc">NPC</SelectItem>}
                  {isNarrator && <SelectItem value="object">Objeto</SelectItem>}
                  {isNarrator && <SelectItem value="deployable">Deployable</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lancer-entity-name">Nome</Label>
              <Input
                id="lancer-entity-name"
                value={entityName}
                onChange={(event) => setEntityName(event.target.value)}
                placeholder={entityType === "pilot" ? "Nome do piloto" : "Identificação"}
                maxLength={120}
              />
            </div>
            {(entityType === "pilot" || entityType === "mech" || entityType === "npc") && (
              <div className="space-y-2">
                <Label htmlFor="lancer-callsign">Callsign</Label>
                <Input
                  id="lancer-callsign"
                  value={callsign}
                  onChange={(event) => setCallsign(event.target.value)}
                  placeholder="Opcional"
                  maxLength={120}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              disabled={!entityName.trim() || createEntity.isPending}
              onClick={() => createEntity.mutate()}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <LancerEntityEditor
        entity={selectedEntity}
        entities={entities}
        items={usableCompendiumItems}
        open={!!selectedEntityId}
        onOpenChange={(nextOpen) => { if (!nextOpen) setSelectedEntityId(null); }}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ["lancer-entities", gameId] });
          void queryClient.invalidateQueries({ queryKey: ["lancer-events", gameId] });
        }}
      />
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof UserRound }) {
  return (
    <div className="flex items-center gap-3 border-b border-border p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <Icon className="h-5 w-5 text-cyan-300" />
      <div>
        <div className="font-mono text-2xl font-black tabular-nums">{value}</div>
        <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function StateLine({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-2">
      <dt className="font-bold uppercase text-muted-foreground">{label}</dt>
      <dd className={`font-mono font-bold uppercase ${accent ? "text-emerald-300" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-2 border-b border-dashed border-border text-center text-muted-foreground">
      <Icon className="h-6 w-6" />
      <span className="text-xs font-semibold uppercase">{label}</span>
    </div>
  );
}

function DatabaseError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-auto mt-10 max-w-2xl border-l-2 border-destructive bg-destructive/10 p-5">
      <div className="flex items-center gap-2 font-black uppercase text-destructive">
        <Shield className="h-4 w-4" /> Fundação LANCER indisponível
      </div>
      <p className="mt-2 break-words text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
