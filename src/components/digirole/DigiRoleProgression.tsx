import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Database, Dumbbell, Plus, ScanLine, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  DIGIROLE_ATTRS,
  DIGIROLE_SKILL_GROUPS,
  DIGIROLE_TRAINING_REQUIRED,
  nextDigiRoleRank,
  type DigiRoleNumbers,
  type DigiRoleRoll,
} from "@/lib/digirole";

type SpeciesSummary = {
  id: string;
  name: string;
  stage: string;
  image_url: string | null;
};

type ScanEntry = {
  species_id: string;
  percentage: number;
  scanned_subject_ids: string[];
  species: SpeciesSummary | null;
};

type ScanTarget = {
  id: string;
  nickname: string | null;
  species_id: string | null;
  species: SpeciesSummary | null;
};

function table(name: string) {
  // DigiRole tables are introduced by the pending local migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from(name as never) as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callRpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? error);
  }
  return String(error);
}

export function DigiRoleScanPanel({
  gameId,
  tamerId,
  canEdit,
  scanPool,
  onRoll,
}: {
  gameId: string;
  tamerId: string;
  canEdit: boolean;
  scanPool: number;
  onRoll: (label: string, pool: number) => Promise<DigiRoleRoll | null>;
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scanQuery = useQuery({
    queryKey: ["digirole-scans", tamerId],
    queryFn: async (): Promise<ScanEntry[]> => {
      const result = await table("digirole_scan_data")
        .select("species_id,percentage,scanned_subject_ids,species:species_id(id,name,stage,image_url)")
        .eq("tamer_id", tamerId)
        .order("percentage", { ascending: false });
      if (result.error) throw result.error;
      return (result.data ?? []).map((raw: ScanEntry & { species: SpeciesSummary | SpeciesSummary[] | null }) => ({
        ...raw,
        scanned_subject_ids: raw.scanned_subject_ids ?? [],
        species: relation(raw.species),
      }));
    },
  });
  const targetsQuery = useQuery({
    queryKey: ["digirole-scan-targets", gameId],
    enabled: dialogOpen,
    queryFn: async (): Promise<ScanTarget[]> => {
      const result = await table("digirole_digimons")
        .select("id,nickname,species_id,species:species_id(id,name,stage,image_url)")
        .eq("game_id", gameId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (result.error) throw result.error;
      return (result.data ?? []).map((raw: ScanTarget & { species: SpeciesSummary | SpeciesSummary[] | null }) => ({
        ...raw,
        species: relation(raw.species),
      }));
    },
  });
  const scannedIds = useMemo(
    () => new Set((scanQuery.data ?? []).flatMap((entry) => entry.scanned_subject_ids)),
    [scanQuery.data],
  );
  const targets = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return (targetsQuery.data ?? []).filter((target) => {
      if (!target.species_id || scannedIds.has(target.id)) return false;
      const label = `${target.nickname ?? ""} ${target.species?.name ?? ""}`.toLocaleLowerCase("pt-BR");
      return !normalized || label.includes(normalized);
    });
  }, [scannedIds, search, targetsQuery.data]);
  const selected = targets.find((entry) => entry.id === targetId) ?? null;

  async function scan() {
    if (!selected?.species) return;
    setBusy(true);
    try {
      const rolled = await onRoll(`Data Scan · ${selected.nickname || selected.species.name}`, scanPool);
      if (!rolled) return;
      const result = await callRpc("record_digirole_scan", {
        p_tamer_id: tamerId,
        p_subject_id: selected.id,
        p_successes: rolled.successes,
      });
      if (result.error) throw result.error;
      const data = result.data as { gained?: number; total?: number } | null;
      toast.success(`Scan concluído: +${data?.gained ?? 0}% · total ${data?.total ?? 0}%`);
      setDialogOpen(false);
      setTargetId(null);
      await queryClient.invalidateQueries({ queryKey: ["digirole-scans", tamerId] });
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function condense(entry: ScanEntry) {
    if (!entry.species || !confirm(`Consumir ${entry.percentage}% de Data e condensar ${entry.species.name}?`)) return;
    setBusy(true);
    try {
      const result = await callRpc("condense_digirole", {
        p_tamer_id: tamerId,
        p_species_id: entry.species_id,
        p_nickname: null,
      });
      if (result.error) throw result.error;
      const data = result.data as { bonus?: number } | null;
      toast.success(`${entry.species.name} condensado${data?.bonus ? ` com +${data.bonus} ponto(s) de Atributo Base` : ""}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["digirole-scans", tamerId] }),
        queryClient.invalidateQueries({ queryKey: ["digirole-tamer", tamerId] }),
        queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] }),
      ]);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-black uppercase text-muted-foreground">Scan Data</h3>
          <p className="text-[10px] text-muted-foreground">WIS + Science · {scanPool > 0 ? `${scanPool}d6` : "Chance"}</p>
        </div>
        {canEdit && <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}><ScanLine className="mr-1 h-3.5 w-3.5" /> Escanear</Button>}
      </div>
      <div className="space-y-2">
        {(scanQuery.data ?? []).map((entry) => (
          <div key={entry.species_id} className="rounded-md border border-border p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <strong className="min-w-0 flex-1 truncate text-xs">{entry.species?.name ?? "Espécie"}</strong>
              <span className="text-xs font-black tabular-nums">{entry.percentage}%</span>
              {canEdit && entry.percentage >= 100 && <Button size="sm" className="h-7" disabled={busy} onClick={() => void condense(entry)}>Condensar</Button>}
            </div>
            <Progress value={entry.percentage / 2} className="h-1.5" />
          </div>
        ))}
        {!scanQuery.isLoading && (scanQuery.data?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Nenhum Data coletado.</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
          <DialogHeader><DialogTitle>Data Scan</DialogTitle></DialogHeader>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Procurar Digimon visível..." autoFocus />
          <div className="min-h-0 space-y-1 overflow-y-auto">
            {targets.map((target) => {
              const active = target.id === targetId;
              return <button key={target.id} type="button" onClick={() => setTargetId(target.id)} className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left ${active ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{target.nickname || target.species?.name || "Digimon"}</strong><span className="block truncate text-[10px] text-muted-foreground">{target.species?.name} · {target.species?.stage}</span></span>{active && <ScanLine className="h-4 w-4 text-primary" />}</button>;
            })}
            {!targetsQuery.isLoading && targets.length === 0 && <p className="p-3 text-xs text-muted-foreground">Nenhum indivíduo disponível para um novo Scan.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button disabled={!selected || busy} onClick={() => void scan()}><ScanLine className="mr-1 h-4 w-4" /> Rolar Scan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function DigiRoleTrainingPanel({
  digimonId,
  name,
  rank,
  trainingSuccesses,
  lastTrainingOn,
  attrs,
  skills,
  canEdit,
  onRoll,
  onProgressed,
}: {
  digimonId: string;
  name: string;
  rank: string;
  trainingSuccesses: number;
  lastTrainingOn: string | null;
  attrs: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  canEdit: boolean;
  onRoll: (label: string, pool: number) => Promise<DigiRoleRoll | null>;
  onProgressed: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [attr, setAttr] = useState("strength");
  const [skill, setSkill] = useState("Athletic");
  const [bonus, setBonus] = useState(0);
  const [busy, setBusy] = useState(false);
  const nextRank = nextDigiRoleRank(rank);
  const required = nextRank ? DIGIROLE_TRAINING_REQUIRED[nextRank] ?? 0 : 0;
  const attrMeta = DIGIROLE_ATTRS.find((entry) => entry.id === attr) ?? DIGIROLE_ATTRS[0];
  const pool = Math.max(0, (attrs[attr] ?? 0) + (skills[skill] ?? 0) + bonus);

  async function train() {
    setBusy(true);
    try {
      const rolled = await onRoll(`${name} · Training Roll · ${attrMeta.short} + ${skill}${bonus ? ` + ${bonus}` : ""}`, pool);
      if (!rolled) return;
      const result = await callRpc("record_digirole_training", {
        p_digimon_id: digimonId,
        p_successes: rolled.successes,
        p_force: false,
      });
      if (result.error) throw result.error;
      const data = result.data as { rankedUp?: boolean; rank?: string; trainingTotal?: number } | null;
      toast.success(data?.rankedUp ? `${name} alcançou o Rank ${data.rank}.` : `Treino registrado: ${data?.trainingTotal ?? 0}/${required}.`);
      setOpen(false);
      await onProgressed();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Dumbbell className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1"><strong className="block text-xs">Treinamento</strong><span className="block text-[10px] text-muted-foreground">{nextRank ? `${trainingSuccesses}/${required} para ${nextRank}` : "Rank normal máximo"}{lastTrainingOn ? ` · último ${lastTrainingOn}` : ""}</span></div>
        {canEdit && nextRank && <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Sessão</Button>}
      </div>
      {nextRank && <Progress value={required > 0 ? (trainingSuccesses / required) * 100 : 0} className="mt-2 h-1.5" />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Sessão de treino</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold">Atributo<Select value={attr} onValueChange={setAttr}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DIGIROLE_ATTRS.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.short} · {entry.label}</SelectItem>)}</SelectContent></Select></label>
            <label className="space-y-1 text-xs font-bold">Perícia<Select value={skill} onValueChange={setSkill}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.values(DIGIROLE_SKILL_GROUPS).flat().map((entry) => <SelectItem key={entry} value={entry}>{entry}</SelectItem>)}</SelectContent></Select></label>
            <label className="space-y-1 text-xs font-bold">Bônus<Input type="number" value={bonus} onChange={(event) => setBonus(Number.parseInt(event.target.value, 10) || 0)} /></label>
            <div className="flex items-end"><div className="w-full rounded border border-border px-3 py-2 text-center text-sm font-black">{pool > 0 ? `${pool}d6` : "Chance Die"}</div></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={busy} onClick={() => void train()}><Dumbbell className="mr-1 h-4 w-4" /> Rolar treino</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ArchiveForm = {
  species_id: string;
  stabilized: boolean;
  victories: number;
  species: SpeciesSummary & { stabilization_victories: number };
};

const NORMAL_RANKS = ["In-Training I", "In-Training II", "Rookie", "Champion", "Ultimate", "Mega", "Mega+"];

export function DigiRoleEvolutionPanel({
  gameId,
  digimonId,
  currentSpeciesId,
  currentSpeciesName,
  rank,
  pe,
  evolutionText,
  canEdit,
  isNarrator,
  onUpdated,
}: {
  gameId: string;
  digimonId: string;
  currentSpeciesId: string | null;
  currentSpeciesName: string;
  rank: string;
  pe: number;
  evolutionText: string | null;
  canEdit: boolean;
  isNarrator: boolean;
  onUpdated: () => Promise<unknown> | void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requirementsConfirmed, setRequirementsConfirmed] = useState(false);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const formsQuery = useQuery({
    queryKey: ["digirole-forms", digimonId],
    queryFn: async (): Promise<ArchiveForm[]> => {
      const result = await table("digirole_forms")
        .select("species_id,stabilized,victories,species:species_id(id,name,stage,image_url,stabilization_victories)")
        .eq("digimon_id", digimonId)
        .order("unlocked_at");
      if (result.error) throw result.error;
      return (result.data ?? []).map((raw: Omit<ArchiveForm, "species"> & { species: ArchiveForm["species"] | ArchiveForm["species"][] }) => ({
        ...raw,
        species: relation(raw.species) as ArchiveForm["species"],
      })).filter((entry: ArchiveForm) => !!entry.species);
    },
  });
  const catalogQuery = useQuery({
    queryKey: ["digirole-evolution-catalog", search],
    enabled: open,
    queryFn: async (): Promise<SpeciesSummary[]> => {
      let builder = table("digirole_species").select("id,name,stage,image_url").order("name").limit(150);
      if (search.trim()) builder = builder.ilike("name", `%${search.trim()}%`);
      const result = await builder;
      if (result.error) throw result.error;
      return (result.data ?? []) as SpeciesSummary[];
    },
  });
  const rankIndex = NORMAL_RANKS.indexOf(rank);
  const unlocked = useMemo(() => new Set((formsQuery.data ?? []).map((entry) => entry.species_id)), [formsQuery.data]);
  const candidates = useMemo(() => {
    const route = (evolutionText ?? "").toLocaleUpperCase("pt-BR");
    return (catalogQuery.data ?? [])
      .filter((entry) => !unlocked.has(entry.id) && entry.id !== currentSpeciesId)
      .filter((entry) => force || rankIndex < 0 || NORMAL_RANKS.indexOf(entry.stage) <= rankIndex)
      .sort((left, right) => {
        const leftRoute = route.includes(left.name.toLocaleUpperCase("pt-BR")) ? 0 : 1;
        const rightRoute = route.includes(right.name.toLocaleUpperCase("pt-BR")) ? 0 : 1;
        return leftRoute - rightRoute || left.name.localeCompare(right.name, "pt-BR");
      });
  }, [catalogQuery.data, currentSpeciesId, evolutionText, force, rankIndex, unlocked]);
  const selected = candidates.find((entry) => entry.id === selectedId) ?? null;

  async function refreshAll() {
    await Promise.all([
      formsQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] }),
      onUpdated(),
    ]);
  }

  async function unlock() {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await callRpc("unlock_digirole_form", {
        p_digimon_id: digimonId,
        p_species_id: selected.id,
        p_requirements_confirmed: requirementsConfirmed,
        p_force: force,
      });
      if (result.error) throw result.error;
      const data = result.data as { cost?: number } | null;
      toast.success(`${selected.name} adicionado ao DigiArchive${data?.cost ? ` por ${data.cost} PE` : ""}.`);
      setOpen(false);
      setSelectedId(null);
      setRequirementsConfirmed(false);
      setForce(false);
      await refreshAll();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function transform(form: ArchiveForm) {
    setBusy(true);
    try {
      const result = await callRpc("transform_digirole_form", {
        p_digimon_id: digimonId,
        p_species_id: form.species_id,
      });
      if (result.error) throw result.error;
      const data = result.data as { digimonDsCost?: number; tamerDsCost?: number; maintenanceDs?: number } | null;
      const totalCost = (data?.digimonDsCost ?? 0) + (data?.tamerDsCost ?? 0);
      toast.success(`${form.species.name} ativado${totalCost ? ` por ${totalCost} DS` : ""}${data?.maintenanceDs ? ` · manutenção ${data.maintenanceDs} DS` : ""}.`);
      await refreshAll();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function victory() {
    setBusy(true);
    try {
      const result = await callRpc("record_digirole_form_victory", { p_digimon_id: digimonId });
      if (result.error) throw result.error;
      const data = result.data as { victories?: number; required?: number; newlyStabilized?: boolean } | null;
      toast.success(data?.newlyStabilized ? `${currentSpeciesName} foi estabilizado.` : `Vitória registrada: ${data?.victories ?? 0}/${data?.required ?? 0}.`);
      await refreshAll();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="min-w-0 flex-1"><strong className="block text-xs">DigiArchive</strong><span className="block text-[10px] text-muted-foreground">{pe} PE · formas e estabilização</span></div>
        {canEdit && <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Desbloquear</Button>}
      </div>
      <div className="space-y-1.5">
        {(formsQuery.data ?? []).map((form) => {
          const active = form.species_id === currentSpeciesId;
          const required = form.species.stabilization_victories ?? 0;
          return <div key={form.species_id} className={`flex items-center gap-2 rounded border px-2 py-2 ${active ? "border-primary bg-primary/5" : "border-border"}`}><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{form.species.name}</strong><span className="block text-[10px] text-muted-foreground">{form.species.stage} · {form.victories}/{required} vitórias</span></span>{form.stabilized && <Badge variant="secondary" className="text-[9px]">Estável</Badge>}{active ? <Badge className="text-[9px]">Ativa</Badge> : canEdit && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void transform(form)}><ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Transformar</Button>}{active && canEdit && !form.stabilized && <Button size="icon" variant="ghost" disabled={busy} title="Registrar vitória nesta forma" onClick={() => void victory()}><Trophy className="h-4 w-4" /></Button>}</div>;
        })}
      </div>
      {evolutionText && <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground"><strong>Rotas desta forma:</strong> {evolutionText}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader><DialogTitle>Desbloquear forma</DialogTitle></DialogHeader>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Procurar forma no catálogo..." autoFocus />
          <div className="min-h-0 space-y-1 overflow-y-auto">
            {candidates.map((entry) => {
              const inRoute = (evolutionText ?? "").toLocaleUpperCase("pt-BR").includes(entry.name.toLocaleUpperCase("pt-BR"));
              const active = selectedId === entry.id;
              return <button type="button" key={entry.id} onClick={() => setSelectedId(entry.id)} className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left ${active ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{entry.name}</strong><span className="block text-[10px] text-muted-foreground">{entry.stage}{inRoute ? " · rota listada" : " · fora do texto extraído"}</span></span>{active && <Sparkles className="h-4 w-4 text-primary" />}</button>;
            })}
          </div>
          <label className="flex items-center gap-2 text-xs"><Checkbox checked={requirementsConfirmed} onCheckedChange={(checked) => setRequirementsConfirmed(checked === true)} /> Requisitos da forma conferidos</label>
          {isNarrator && <label className="flex items-center gap-2 text-xs"><Checkbox checked={force} onCheckedChange={(checked) => setForce(checked === true)} /> Forçar rota como narrador</label>}
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={!selected || (!requirementsConfirmed && !force) || busy} onClick={() => void unlock()}><Sparkles className="mr-1 h-4 w-4" /> Desbloquear</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
