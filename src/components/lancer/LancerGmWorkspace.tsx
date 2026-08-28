import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Eye,
  EyeOff,
  Flag,
  History,
  Play,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Swords,
  Target,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { composeLancerNpc, parseLancerDeploymentHexes, validateLancerEncounter } from "@/lib/lancer/gm-engine";
import { createEmptyLancerBuild } from "@/lib/lancer/rules-engine";
import type {
  LancerCombatSession,
  LancerCombatTransaction,
  LancerCompendiumItem,
  LancerEncounter,
  LancerEncounterInstance,
  LancerEncounterObjective,
  LancerEncounterRosterEntry,
  LancerEntity,
  LancerHexMap,
  LancerNpcBlueprint,
} from "@/lib/lancer/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  gameId: string;
  userId: string;
  isNarrator: boolean;
  entities: LancerEntity[];
  items: LancerCompendiumItem[];
};

type RpcResult<T> = { data: T | null; error: { message: string; code?: string } | null };
type LancerGameTable =
  | "lancer_npc_blueprints"
  | "lancer_encounters"
  | "lancer_encounter_instances"
  | "lancer_maps";

async function listByGame<T>(table: LancerGameTable, gameId: string, order = "created_at", ascending = false): Promise<T[]> {
  const response = await supabase.from(table)
    .select("*")
    .eq("game_id", gameId)
    .order(order, { ascending });
  if (response.error) throw new Error(response.error.message);
  return (response.data ?? []) as T[];
}

function formatMoment(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function displayName(entity: LancerEntity): string {
  return entity.callsign || entity.name;
}

function ToggleItem({
  item,
  checked,
  onCheckedChange,
}: {
  item: LancerCompendiumItem;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 border-b border-border/70 px-2 py-2 last:border-b-0">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-bold uppercase">{item.name}</span>
        {item.description && <span className="line-clamp-2 text-[10px] text-muted-foreground">{item.description}</span>}
      </span>
    </label>
  );
}

export function LancerGmWorkspace({ gameId, userId, isNarrator, entities, items }: Props) {
  const queryClient = useQueryClient();
  const blueprintsQuery = useQuery({
    queryKey: ["lancer-npc-blueprints", gameId],
    queryFn: () => listByGame<LancerNpcBlueprint>("lancer_npc_blueprints", gameId, "name", true),
    retry: false,
  });
  const encountersQuery = useQuery({
    queryKey: ["lancer-encounters", gameId],
    queryFn: () => listByGame<LancerEncounter>("lancer_encounters", gameId, "name", true),
    retry: false,
  });
  const instancesQuery = useQuery({
    queryKey: ["lancer-encounter-instances", gameId],
    queryFn: () => listByGame<LancerEncounterInstance>("lancer_encounter_instances", gameId),
    retry: false,
  });
  const mapsQuery = useQuery({
    queryKey: ["lancer-all-maps", gameId],
    queryFn: () => listByGame<LancerHexMap>("lancer_maps", gameId, "name", true),
    retry: false,
  });
  const transactionsQuery = useQuery({
    queryKey: ["lancer-transactions", gameId],
    queryFn: async () => {
      const response = await supabase.from("lancer_combat_transactions")
        .select("*")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (response.error) throw new Error(response.error.message);
      return (response.data ?? []) as LancerCombatTransaction[];
    },
    retry: false,
  });
  const combatQuery = useQuery({
    queryKey: ["lancer-gm-active-combat", gameId],
    queryFn: async () => {
      const response = await supabase.from("lancer_combat_sessions")
        .select("*")
        .eq("game_id", gameId)
        .eq("status", "active")
        .maybeSingle();
      if (response.error) throw new Error(response.error.message);
      return response.data as LancerCombatSession | null;
    },
    retry: false,
  });

  const refreshPhaseSeven = () => {
    void queryClient.invalidateQueries({ queryKey: ["lancer-npc-blueprints", gameId] });
    void queryClient.invalidateQueries({ queryKey: ["lancer-encounters", gameId] });
    void queryClient.invalidateQueries({ queryKey: ["lancer-encounter-instances", gameId] });
    void queryClient.invalidateQueries({ queryKey: ["lancer-transactions", gameId] });
    void queryClient.invalidateQueries({ queryKey: ["lancer-gm-active-combat", gameId] });
    void queryClient.invalidateQueries({ queryKey: ["lancer-entities", gameId] });
    void queryClient.invalidateQueries({ queryKey: ["lancer-events", gameId] });
  };
  const phaseSevenError = blueprintsQuery.error || encountersQuery.error || instancesQuery.error || mapsQuery.error;

  if (!isNarrator) {
    return (
      <div className="mx-auto mt-12 max-w-xl border-l-2 border-amber-400 bg-amber-400/10 p-5">
        <div className="flex items-center gap-2 text-sm font-black uppercase text-amber-300"><ShieldAlert className="h-4 w-4" /> Área do GM</div>
        <p className="mt-2 text-xs text-muted-foreground">NPC Builder, encontros e overrides são visíveis apenas para o narrador.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      {phaseSevenError && (
        <div className="mb-4 border-l-2 border-destructive bg-destructive/10 p-3 text-xs">
          A estrutura da Fase 7 ainda não está disponível neste banco. Execute a migration <strong>20260822200000_lancer_gm_encounters.sql</strong> antes do teste conectado.
        </div>
      )}
      <Tabs defaultValue="npcs" className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]">
        <TabsList className="grid h-10 w-full max-w-xl grid-cols-3 rounded-md border border-border bg-[#101720] p-1">
          <TabsTrigger value="npcs" className="gap-1.5 rounded-sm"><Bot className="h-4 w-4" /> NPC Builder</TabsTrigger>
          <TabsTrigger value="encounters" className="gap-1.5 rounded-sm"><Flag className="h-4 w-4" /> Encontros</TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5 rounded-sm"><Wrench className="h-4 w-4" /> GM Tools</TabsTrigger>
        </TabsList>
        <TabsContent value="npcs" className="mt-4 min-h-0 overflow-hidden">
          <NpcBuilder
            gameId={gameId}
            userId={userId}
            items={items}
            blueprints={blueprintsQuery.data ?? []}
            onChanged={refreshPhaseSeven}
          />
        </TabsContent>
        <TabsContent value="encounters" className="mt-4 min-h-0 overflow-hidden">
          <EncounterBuilder
            gameId={gameId}
            userId={userId}
            items={items}
            maps={mapsQuery.data ?? []}
            blueprints={blueprintsQuery.data ?? []}
            encounters={encountersQuery.data ?? []}
            instances={instancesQuery.data ?? []}
            activeCombat={combatQuery.data ?? null}
            onChanged={refreshPhaseSeven}
          />
        </TabsContent>
        <TabsContent value="tools" className="mt-4 min-h-0 overflow-hidden">
          <GmTools
            gameId={gameId}
            entities={entities}
            transactions={transactionsQuery.data ?? []}
            activeCombat={combatQuery.data ?? null}
            activeInstance={(instancesQuery.data ?? []).find((instance) => instance.status === "active") ?? null}
            onChanged={refreshPhaseSeven}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NpcBuilder({
  gameId,
  userId,
  items,
  blueprints,
  onChanged,
}: {
  gameId: string;
  userId: string;
  items: LancerCompendiumItem[];
  blueprints: LancerNpcBlueprint[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [tier, setTier] = useState<1 | 2 | 3>(1);
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [featureIds, setFeatureIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const classes = items.filter((item) => item.item_type === "npc_class");
  const templates = items.filter((item) => item.item_type === "npc_template");
  const features = items.filter((item) => item.item_type === "npc_feature");
  const composition = useMemo(() => {
    const classItem = classes.find((item) => item.id === classId);
    if (!classItem || !name.trim()) return null;
    try {
      return composeLancerNpc({
        name,
        tier,
        classItem,
        templates: templates.filter((item) => templateIds.includes(item.id)),
        optionalFeatures: features.filter((item) => featureIds.includes(item.id)),
      });
    } catch {
      return null;
    }
  }, [classId, classes, featureIds, features, name, templateIds, templates, tier]);

  const saveBlueprint = useMutation({
    mutationFn: async () => {
      if (!composition || !classId) throw new Error("Complete a composição do NPC.");
      const response = await supabase.from("lancer_npc_blueprints")
        .insert({
          game_id: gameId,
          name: name.trim(),
          class_item_id: classId,
          tier,
          template_item_ids: templateIds,
          optional_feature_item_ids: featureIds,
          canonical_state: composition.state,
          action_ids: composition.actionIds,
          notes: notes.trim(),
          created_by: userId,
        })
        .select("*")
        .single();
      if (response.error) throw new Error(response.error.message);
      return response.data as LancerNpcBlueprint;
    },
    onSuccess: () => {
      setName("");
      setClassId("");
      setTemplateIds([]);
      setFeatureIds([]);
      setNotes("");
      onChanged();
      toast.success("Blueprint de NPC salvo.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const spawnBlueprint = useMutation({
    mutationFn: async (blueprint: LancerNpcBlueprint) => {
      const { data, error } = await (supabase.rpc("create_lancer_entity" as never, {
        p_game_id: gameId,
        p_entity_type: "npc",
        p_name: blueprint.name,
        p_callsign: blueprint.name,
        p_owner_id: userId,
        p_current_state: blueprint.canonical_state,
        p_build_state: { ...createEmptyLancerBuild(), status: "valid", validation: { valid: true, errors: [] } },
      } as never) as unknown as Promise<RpcResult<LancerEntity>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { onChanged(); toast.success("NPC criado e pronto para ser posicionado."); },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = (list: string[], id: string, checked: boolean, setter: (next: string[]) => void) => {
    setter(checked ? [...new Set([...list, id])] : list.filter((value) => value !== id));
  };

  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
      <ScrollArea className="min-h-0 border border-border bg-[#0e151d] p-4">
        <div className="space-y-5 pr-3">
          <div>
            <h2 className="text-sm font-black uppercase">Composição do NPC</h2>
            <p className="text-xs text-muted-foreground">Classe → Tier → Templates → Features opcionais → Finalizar.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_12rem]">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Assault Leader" /></div>
            <div className="space-y-1.5"><Label>Classe</Label><Select value={classId} onValueChange={setClassId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Tier</Label><div className="grid grid-cols-3 gap-1">{([1, 2, 3] as const).map((value) => <Button key={value} type="button" size="sm" variant={tier === value ? "default" : "outline"} onClick={() => setTier(value)}>T{value}</Button>)}</div></div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>Templates</Label><div className="mt-1 max-h-52 overflow-auto border border-border">{templates.length ? templates.map((item) => <ToggleItem key={item.id} item={item} checked={templateIds.includes(item.id)} onCheckedChange={(checked) => toggle(templateIds, item.id, checked, setTemplateIds)} />) : <p className="p-3 text-xs text-muted-foreground">Importe um LCP com templates de NPC.</p>}</div></div>
            <div><Label>Features opcionais</Label><div className="mt-1 max-h-52 overflow-auto border border-border">{features.length ? features.map((item) => <ToggleItem key={item.id} item={item} checked={featureIds.includes(item.id)} onCheckedChange={(checked) => toggle(featureIds, item.id, checked, setFeatureIds)} />) : <p className="p-3 text-xs text-muted-foreground">Importe um LCP com features de NPC.</p>}</div></div>
          </div>
          <div className="space-y-1.5"><Label>Notas do blueprint</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20" /></div>
          {composition && (
            <div className="border-l-2 border-cyan-400 bg-cyan-400/5 p-3">
              <div className="flex flex-wrap gap-4 text-xs">
                {(["hp", "heat"] as const).map((key) => composition.state.resources[key] && <span key={key}><strong className="uppercase">{key}</strong> {composition.state.resources[key]!.max}</span>)}
                {(["armor", "evasion", "eDefense", "speed", "saveTarget"] as const).map((key) => <span key={key}><strong>{key}</strong> {composition.state.stats[key]}</span>)}
                <span><strong>Ações</strong> {composition.actionIds.length}</span>
              </div>
              {composition.warnings.map((warning) => <p key={warning} className="mt-2 text-[10px] text-amber-300">{warning}</p>)}
            </div>
          )}
          <Button disabled={!composition || saveBlueprint.isPending} onClick={() => saveBlueprint.mutate()}><Save className="mr-1.5 h-4 w-4" /> Finalizar blueprint</Button>
        </div>
      </ScrollArea>

      <section className="flex min-h-0 flex-col border border-border bg-[#0e151d]">
        <div className="border-b border-border p-4"><h2 className="text-sm font-black uppercase">Biblioteca de NPCs</h2><p className="text-xs text-muted-foreground">{blueprints.length} blueprint(s)</p></div>
        <ScrollArea className="min-h-0 flex-1">
          {blueprints.map((blueprint) => (
            <div key={blueprint.id} className="border-b border-border p-3">
              <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase">{blueprint.name}</div><div className="mt-1 flex gap-2"><Badge variant="outline" className="rounded-sm">T{blueprint.tier}</Badge><span className="text-[10px] text-muted-foreground">{blueprint.action_ids.length} ações</span></div></div><Button size="sm" variant="outline" disabled={spawnBlueprint.isPending} onClick={() => spawnBlueprint.mutate(blueprint)}><Plus className="mr-1 h-3.5 w-3.5" /> Instância</Button></div>
            </div>
          ))}
          {!blueprints.length && <p className="p-5 text-center text-xs text-muted-foreground">Nenhum blueprint salvo.</p>}
        </ScrollArea>
      </section>
    </div>
  );
}

function EncounterBuilder({
  gameId,
  userId,
  items,
  maps,
  blueprints,
  encounters,
  instances,
  activeCombat,
  onChanged,
}: {
  gameId: string;
  userId: string;
  items: LancerCompendiumItem[];
  maps: LancerHexMap[];
  blueprints: LancerNpcBlueprint[];
  encounters: LancerEncounter[];
  instances: LancerEncounterInstance[];
  activeCombat: LancerCombatSession | null;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [mapId, setMapId] = useState("");
  const [sitrepId, setSitrepId] = useState("");
  const [objectiveType, setObjectiveType] = useState<LancerEncounterObjective["type"]>("elimination");
  const [objectiveName, setObjectiveName] = useState("Neutralizar forças hostis");
  const [description, setDescription] = useState("");
  const [victory, setVictory] = useState("Todos os hostis derrotados");
  const [defeat, setDefeat] = useState("Todos os pilotos incapacitados");
  const [roundLimit, setRoundLimit] = useState("");
  const [scoreTarget, setScoreTarget] = useState("");
  const [roster, setRoster] = useState<Record<string, LancerEncounterRosterEntry>>({});
  const [playerHexes, setPlayerHexes] = useState("");
  const [enemyHexes, setEnemyHexes] = useState("");
  const [reserveHexes, setReserveHexes] = useState("");
  const [notes, setNotes] = useState("");
  const sitreps = items.filter((item) => item.item_type === "sitreps");
  const rosterEntries = Object.values(roster).filter((entry) => entry.count > 0);
  const objective: LancerEncounterObjective = {
    type: objectiveType,
    name: objectiveName,
    description,
    roundLimit: roundLimit ? Math.max(1, Number(roundLimit)) : null,
    victoryCondition: victory,
    defeatCondition: defeat,
    scoreTarget: scoreTarget ? Math.max(1, Number(scoreTarget)) : null,
    triggers: [],
  };
  const deployment = {
    player: parseLancerDeploymentHexes(playerHexes),
    enemy: parseLancerDeploymentHexes(enemyHexes),
    reserve: parseLancerDeploymentHexes(reserveHexes),
  };
  const validation = validateLancerEncounter({ name, mapId, objective, roster: rosterEntries, deployment });

  const saveEncounter = useMutation({
    mutationFn: async () => {
      if (validation.length) throw new Error(validation[0]);
      const response = await supabase.from("lancer_encounters")
        .insert({
          game_id: gameId,
          name: name.trim(),
          map_id: mapId,
          sitrep_item_id: sitrepId || null,
          objective,
          enemy_roster: rosterEntries,
          reserves: rosterEntries.filter((entry) => entry.reserve),
          reinforcements: rosterEntries.filter((entry) => !!entry.reinforcementRound),
          deployment,
          notes: notes.trim(),
          created_by: userId,
        })
        .select("*")
        .single();
      if (response.error) throw new Error(response.error.message);
      return response.data as LancerEncounter;
    },
    onSuccess: () => { setName(""); setRoster({}); onChanged(); toast.success("Modelo de encontro salvo."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const startEncounter = useMutation({
    mutationFn: async (encounterId: string) => {
      const { data, error } = await (supabase.rpc("start_lancer_encounter" as never, { p_encounter_id: encounterId } as never) as unknown as Promise<RpcResult<LancerEncounterInstance>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { onChanged(); toast.success("Encontro iniciado; NPCs e turnos foram preparados."); },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRoster = (blueprintId: string, patch: Partial<LancerEncounterRosterEntry>) => {
    setRoster((current) => {
      const previous = current[blueprintId] ?? { blueprintId, count: 0, reserve: false, reinforcementRound: null };
      return { ...current, [blueprintId]: { ...previous, ...patch, blueprintId } };
    });
  };

  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(21rem,0.8fr)]">
      <ScrollArea className="min-h-0 border border-border bg-[#0e151d] p-4">
        <div className="space-y-5 pr-3">
          <div><h2 className="text-sm font-black uppercase">Encounter Builder</h2><p className="text-xs text-muted-foreground">O modelo permanece intacto; iniciar cria uma nova instância.</p></div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Operação Sol Nascente" /></div>
            <div className="space-y-1.5"><Label>Mapa</Label><Select value={mapId} onValueChange={setMapId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{maps.map((map) => <SelectItem key={map.id} value={map.id}>{map.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Sitrep</Label><Select value={sitrepId || "none"} onValueChange={(value) => setSitrepId(value === "none" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Custom</SelectItem>{sitreps.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="grid gap-3 border-l-2 border-amber-400/50 pl-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Tipo do objetivo</Label><Select value={objectiveType} onValueChange={(value) => setObjectiveType(value as LancerEncounterObjective["type"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["elimination", "control", "escort", "extraction", "survival", "custom"].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Objetivo</Label><Input value={objectiveName} onChange={(event) => setObjectiveName(event.target.value)} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Descrição</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-16" /></div>
            <div className="space-y-1.5"><Label>Vitória</Label><Input value={victory} onChange={(event) => setVictory(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Derrota</Label><Input value={defeat} onChange={(event) => setDefeat(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Limite de rounds</Label><Input type="number" min={1} value={roundLimit} onChange={(event) => setRoundLimit(event.target.value)} placeholder="Sem limite" /></div>
            <div className="space-y-1.5"><Label>Meta de pontos</Label><Input type="number" min={1} value={scoreTarget} onChange={(event) => setScoreTarget(event.target.value)} placeholder="Opcional" /></div>
          </div>
          <div>
            <Label>Forças inimigas, reservas e reforços</Label>
            <div className="mt-1 border border-border">
              {blueprints.map((blueprint) => {
                const entry = roster[blueprint.id] ?? { blueprintId: blueprint.id, count: 0, reserve: false, reinforcementRound: null };
                return <div key={blueprint.id} className="grid items-center gap-2 border-b border-border p-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_6rem_7rem_8rem]"><div><span className="text-xs font-bold uppercase">{blueprint.name}</span><span className="ml-2 text-[10px] text-muted-foreground">T{blueprint.tier}</span></div><Input type="number" min={0} max={50} value={entry.count} onChange={(event) => updateRoster(blueprint.id, { count: Number(event.target.value) })} title="Quantidade" /><label className="flex items-center gap-2 text-xs"><Checkbox checked={!!entry.reserve} onCheckedChange={(value) => updateRoster(blueprint.id, { reserve: value === true, reinforcementRound: null })} /> Reserva</label><Input type="number" min={1} value={entry.reinforcementRound ?? ""} onChange={(event) => updateRoster(blueprint.id, { reserve: false, reinforcementRound: event.target.value ? Number(event.target.value) : null })} placeholder="Round" title="Round do reforço" /></div>;
              })}
              {!blueprints.length && <p className="p-3 text-xs text-muted-foreground">Crie blueprints de NPC antes de montar o encontro.</p>}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5"><Label>Deployment dos jogadores</Label><Textarea value={playerHexes} onChange={(event) => setPlayerHexes(event.target.value)} placeholder="0,0; 1,0; 0,1" className="min-h-20 font-mono text-xs" /></div>
            <div className="space-y-1.5"><Label>Deployment inimigo</Label><Textarea value={enemyHexes} onChange={(event) => setEnemyHexes(event.target.value)} placeholder="12,8; 13,8; 12,9" className="min-h-20 font-mono text-xs" /></div>
            <div className="space-y-1.5"><Label>Área de reserva</Label><Textarea value={reserveHexes} onChange={(event) => setReserveHexes(event.target.value)} placeholder="15,10; 16,10" className="min-h-20 font-mono text-xs" /></div>
          </div>
          <div className="space-y-1.5"><Label>Notas do GM</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20" /></div>
          {validation.length > 0 && <div className="border-l-2 border-amber-400 bg-amber-400/5 p-3">{validation.map((message) => <p key={message} className="text-[10px] text-amber-300">{message}</p>)}</div>}
          <Button disabled={validation.length > 0 || saveEncounter.isPending} onClick={() => saveEncounter.mutate()}><Save className="mr-1.5 h-4 w-4" /> Salvar encontro</Button>
        </div>
      </ScrollArea>

      <section className="flex min-h-0 flex-col border border-border bg-[#0e151d]">
        <div className="border-b border-border p-4"><h2 className="text-sm font-black uppercase">Operações preparadas</h2>{activeCombat && <p className="mt-1 text-xs text-amber-300">Combate ativo · round {activeCombat.round}</p>}</div>
        <ScrollArea className="min-h-0 flex-1">
          {encounters.map((encounter) => {
            const instanceCount = instances.filter((instance) => instance.encounter_id === encounter.id).length;
            return <div key={encounter.id} className="border-b border-border p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-black uppercase">{encounter.name}</div><div className="mt-1 text-[10px] text-muted-foreground">{encounter.objective.name} · {encounter.enemy_roster.reduce((sum, entry) => sum + entry.count, 0)} inimigo(s) · {instanceCount} execução(ões)</div></div><Button size="sm" disabled={!!activeCombat || startEncounter.isPending} onClick={() => startEncounter.mutate(encounter.id)}><Play className="mr-1 h-3.5 w-3.5" /> Iniciar</Button></div></div>;
          })}
          {!encounters.length && <p className="p-5 text-center text-xs text-muted-foreground">Nenhum encontro salvo.</p>}
        </ScrollArea>
      </section>
    </div>
  );
}

function GmTools({
  gameId,
  entities,
  transactions,
  activeCombat,
  activeInstance,
  onChanged,
}: {
  gameId: string;
  entities: LancerEntity[];
  transactions: LancerCombatTransaction[];
  activeCombat: LancerCombatSession | null;
  activeInstance: LancerEncounterInstance | null;
  onChanged: () => void;
}) {
  const [entityId, setEntityId] = useState("");
  const [resourceKey, setResourceKey] = useState("hp");
  const [delta, setDelta] = useState("-1");
  const [conditionName, setConditionName] = useState("");
  const [reason, setReason] = useState("");
  const entity = entities.find((candidate) => candidate.id === entityId) ?? null;
  const resources = entity ? Object.entries(entity.current_state.resources).filter((entry) => !!entry[1]) : [];

  const override = useMutation({
    mutationFn: async (operation: "resource" | "add-condition" | "remove-condition") => {
      if (!entity) throw new Error("Selecione uma entidade.");
      const next = structuredClone(entity.current_state);
      if (operation === "resource") {
        const resource = next.resources[resourceKey];
        if (!resource) throw new Error("Selecione um recurso válido.");
        resource.current = Math.max(0, Math.min(resource.max, resource.current + Number(delta || 0)));
      } else if (operation === "add-condition") {
        if (!conditionName.trim()) throw new Error("Informe a condição.");
        if (!next.conditions.some((condition) => condition.name.toLowerCase() === conditionName.trim().toLowerCase())) {
          next.conditions.push({ id: `gm:${crypto.randomUUID()}`, name: conditionName.trim(), duration: "scene", effects: [] });
        }
      } else {
        next.conditions = next.conditions.filter((condition) => condition.name.toLowerCase() !== conditionName.trim().toLowerCase());
        next.statuses = next.statuses.filter((condition) => condition.name.toLowerCase() !== conditionName.trim().toLowerCase());
      }
      const { data, error } = await (supabase.rpc("gm_override_lancer_entity" as never, {
        p_entity_id: entity.id,
        p_expected_revision: entity.revision,
        p_next_state: next,
        p_reason: reason.trim() || operation,
      } as never) as unknown as Promise<RpcResult<LancerEntity>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { onChanged(); toast.success("Override aplicado e registrado."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const undo = useMutation({
    mutationFn: async (transactionId: string) => {
      const { data, error } = await (supabase.rpc("undo_lancer_transaction" as never, { p_transaction_id: transactionId, p_reason: reason.trim() || "Undo pelo GM" } as never) as unknown as Promise<RpcResult<LancerCombatTransaction>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { onChanged(); toast.success("Transação desfeita por completo."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const visibility = useMutation({
    mutationFn: async (hidden: boolean) => {
      if (!entity) throw new Error("Selecione uma entidade posicionada no mapa.");
      const { data, error } = await (supabase.rpc("gm_set_lancer_token_hidden" as never, { p_entity_id: entity.id, p_hidden: hidden } as never) as unknown as Promise<RpcResult<unknown>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { onChanged(); toast.success("Visibilidade do token atualizada."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const advanceRound = useMutation({
    mutationFn: async () => {
      if (!activeCombat) throw new Error("Não há combate ativo.");
      const { data, error } = await (supabase.rpc("gm_advance_lancer_round" as never, { p_session_id: activeCombat.id } as never) as unknown as Promise<RpcResult<LancerCombatSession>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { onChanged(); toast.success("Próximo round iniciado."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const finishEncounter = useMutation({
    mutationFn: async (outcome: "victory" | "defeat" | "complete") => {
      if (!activeInstance) throw new Error("Não há encontro ativo.");
      const { data, error } = await (supabase.rpc("gm_finish_lancer_encounter" as never, { p_instance_id: activeInstance.id, p_outcome: outcome } as never) as unknown as Promise<RpcResult<LancerEncounterInstance>>);
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => { onChanged(); toast.success("Encontro encerrado."); },
    onError: (error: Error) => toast.error(error.message),
  });

  const reversible = transactions.filter((transaction) => !transaction.reversed_by && transaction.action_type !== "undo");
  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
      <ScrollArea className="min-h-0 border border-border bg-[#0e151d] p-4">
        <div className="space-y-5 pr-3">
          <div><h2 className="text-sm font-black uppercase">Manual Override</h2><p className="text-xs text-muted-foreground">Toda alteração registra antes, depois, motivo, GM e horário.</p></div>
          <div className="space-y-1.5"><Label>Entidade</Label><Select value={entityId} onValueChange={(value) => { setEntityId(value); const selected = entities.find((candidate) => candidate.id === value); setResourceKey(Object.keys(selected?.current_state.resources ?? {})[0] ?? "hp"); }}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{entities.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{displayName(candidate)} · {candidate.entity_type}</SelectItem>)}</SelectContent></Select></div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <div className="space-y-1.5"><Label>Recurso</Label><Select value={resourceKey} onValueChange={setResourceKey}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{resources.map(([key]) => <SelectItem key={key} value={key}>{key}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Variação</Label><Input type="number" value={delta} onChange={(event) => setDelta(event.target.value)} /></div>
          </div>
          <Button className="w-full" disabled={!entity || override.isPending} onClick={() => override.mutate("resource")}><Target className="mr-1.5 h-4 w-4" /> Aplicar dano, cura ou calor</Button>
          <div className="space-y-1.5"><Label>Condição ou status</Label><Input value={conditionName} onChange={(event) => setConditionName(event.target.value)} placeholder="Jammed, Impaired..." /><div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={!entity || override.isPending} onClick={() => override.mutate("add-condition")}><Plus className="mr-1 h-4 w-4" /> Adicionar</Button><Button variant="outline" disabled={!entity || override.isPending} onClick={() => override.mutate("remove-condition")}>Remover</Button></div></div>
          <div className="space-y-1.5"><Label>Motivo do override</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-20" placeholder="Opcional, mas recomendado" /></div>
          <div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={!entity || visibility.isPending} onClick={() => visibility.mutate(false)}><Eye className="mr-1 h-4 w-4" /> Revelar</Button><Button variant="outline" disabled={!entity || visibility.isPending} onClick={() => visibility.mutate(true)}><EyeOff className="mr-1 h-4 w-4" /> Ocultar</Button></div>
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-black uppercase">Controle do encontro</div><div className="text-[10px] text-muted-foreground">{activeCombat ? `Round ${activeCombat.round}` : "Sem combate ativo"}</div></div><Button size="sm" variant="outline" disabled={!activeCombat || advanceRound.isPending} onClick={() => advanceRound.mutate()}><Swords className="mr-1 h-3.5 w-3.5" /> Próximo round</Button></div>
            {activeInstance && <div className="mt-3 grid grid-cols-3 gap-2"><Button size="sm" onClick={() => finishEncounter.mutate("victory")}>Vitória</Button><Button size="sm" variant="destructive" onClick={() => finishEncounter.mutate("defeat")}>Derrota</Button><Button size="sm" variant="outline" onClick={() => finishEncounter.mutate("complete")}>Encerrar</Button></div>}
          </div>
        </div>
      </ScrollArea>

      <section className="flex min-h-0 flex-col border border-border bg-[#0e151d]">
        <div className="border-b border-border p-4"><h2 className="flex items-center gap-2 text-sm font-black uppercase"><History className="h-4 w-4 text-cyan-300" /> Histórico reversível</h2><p className="text-xs text-muted-foreground">Undo só é permitido quando nenhum estado posterior seria sobrescrito.</p></div>
        <ScrollArea className="min-h-0 flex-1">
          {reversible.map((transaction) => (
            <div key={transaction.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border p-3"><div className="min-w-0"><div className="truncate text-xs font-bold uppercase">{transaction.action_type.replaceAll("_", " ")}</div><div className="mt-1 text-[10px] text-muted-foreground">{formatMoment(transaction.created_at)} · {transaction.id.slice(0, 8)}</div></div><Button size="icon" variant="outline" title="Desfazer esta transação" disabled={undo.isPending} onClick={() => undo.mutate(transaction.id)}><RotateCcw className="h-4 w-4" /></Button></div>
          ))}
          {!reversible.length && <p className="p-5 text-center text-xs text-muted-foreground">Nenhuma transação reversível.</p>}
        </ScrollArea>
      </section>
    </div>
  );
}
