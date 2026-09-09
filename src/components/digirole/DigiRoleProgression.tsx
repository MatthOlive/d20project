import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Database, Dumbbell, Plus, ScanLine, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { fetchDigiApiImage } from "@/lib/digi-api";
import { syncDigiRoleSignatureTechniques } from "@/lib/digirole-techniques";
import {
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
  evolution_text?: string | null;
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
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
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
  activePageId,
  tamerId,
  canEdit,
  scanPool,
  onRoll,
}: {
  gameId: string;
  activePageId: string | null;
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
        .select(
          "species_id,percentage,scanned_subject_ids,species:species_id(id,name,stage,image_url)",
        )
        .eq("tamer_id", tamerId)
        .order("percentage", { ascending: false });
      if (result.error) throw result.error;
      return (result.data ?? []).map(
        (raw: ScanEntry & { species: SpeciesSummary | SpeciesSummary[] | null }) => ({
          ...raw,
          scanned_subject_ids: raw.scanned_subject_ids ?? [],
          species: relation(raw.species),
        }),
      );
    },
  });
  const targetsQuery = useQuery({
    queryKey: ["digirole-scan-targets", gameId, activePageId],
    enabled: dialogOpen,
    queryFn: async (): Promise<ScanTarget[]> => {
      if (!activePageId) return [];
      const tokenResult = await table("tokens")
        .select("character_id")
        .eq("game_id", gameId)
        .eq("page_id", activePageId)
        .eq("character_kind", "digirole_digimon");
      if (tokenResult.error) throw tokenResult.error;
      const visibleIds = [
        ...new Set(
          (tokenResult.data ?? [])
            .map((token: { character_id: string | null }) => token.character_id)
            .filter(Boolean),
        ),
      ] as string[];
      if (!visibleIds.length) return [];
      const result = await table("digirole_digimons")
        .select("id,nickname,species_id,species:species_id(id,name,stage,image_url)")
        .eq("game_id", gameId)
        .in("id", visibleIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (result.error) throw result.error;
      return (result.data ?? []).map(
        (raw: ScanTarget & { species: SpeciesSummary | SpeciesSummary[] | null }) => ({
          ...raw,
          species: relation(raw.species),
        }),
      );
    },
  });
  const targets = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return (targetsQuery.data ?? []).filter((target) => {
      if (!target.species_id) return false;
      const label = `${target.nickname ?? ""} ${target.species?.name ?? ""}`.toLocaleLowerCase(
        "pt-BR",
      );
      return !normalized || label.includes(normalized);
    });
  }, [search, targetsQuery.data]);
  const selected = targets.find((entry) => entry.id === targetId) ?? null;

  async function scan() {
    if (!selected?.species) return;
    setBusy(true);
    try {
      const rolled = await onRoll(
        `Data Scan · ${selected.nickname || selected.species.name}`,
        scanPool,
      );
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
    if (
      !entry.species ||
      !confirm(`Consumir ${entry.percentage}% de Data e criar uma ficha de ${entry.species.name}?`)
    )
      return;
    setBusy(true);
    try {
      const result = await callRpc("condense_digirole", {
        p_tamer_id: tamerId,
        p_species_id: entry.species_id,
        p_nickname: null,
      });
      if (result.error) throw result.error;
      const data = result.data as { digimonId?: string; bonus?: number } | null;
      if (!data?.digimonId) throw new Error("A criação não retornou a ficha do Digimon.");

      const assignment = await callRpc("assign_digimon_to_tamer", {
        p_digimon_id: data.digimonId,
        p_tamer_id: tamerId,
        p_team_slot: 0,
      });
      const assignedSlot = assignment.error
        ? null
        : typeof assignment.data === "number"
          ? assignment.data
          : null;
      toast.success(
        `${entry.species.name} criado e adicionado ${assignedSlot ? `ao Time (espaço ${assignedSlot})` : "à Nuvem"}${data.bonus ? ` com +${data.bonus} ponto(s) de Atributo Base` : ""}.`,
      );
      if (assignment.error) {
        toast.warning("A ficha foi criada na Nuvem, mas não foi possível ocupar automaticamente o Time.");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["digirole-scans", tamerId] }),
        queryClient.invalidateQueries({ queryKey: ["digirole-tamer", tamerId] }),
        queryClient.invalidateQueries({ queryKey: ["digirole-roster", tamerId] }),
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
          <p className="text-[10px] text-muted-foreground">
            Sabedoria + Science · {scanPool > 0 ? `${scanPool}d6` : "Chance"}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <ScanLine className="mr-1 h-3.5 w-3.5" /> Escanear
          </Button>
        )}
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {(scanQuery.data ?? []).map((entry) => (
          <button
            key={entry.species_id}
            type="button"
            disabled={!canEdit || entry.percentage < 100 || busy}
            onClick={() => void condense(entry)}
            title={entry.percentage >= 100 ? `Criar ${entry.species?.name ?? "Digimon"}` : undefined}
            className="block w-full rounded-md border border-border p-2.5 text-left transition enabled:cursor-pointer enabled:hover:border-primary enabled:hover:bg-primary/5 disabled:cursor-default"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <strong className="min-w-0 flex-1 truncate text-xs">
                {entry.species?.name ?? "Espécie"}
              </strong>
              <span className="text-xs font-black tabular-nums">{entry.percentage}%</span>
              {canEdit && entry.percentage >= 100 && (
                <span className="rounded bg-primary px-2 py-1 text-[10px] font-black text-primary-foreground">
                  Criar Digimon
                </span>
              )}
            </div>
            <Progress value={entry.percentage / 2} className="h-1.5" />
          </button>
        ))}
        {!scanQuery.isLoading && (scanQuery.data?.length ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum Data coletado.</p>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Data Scan</DialogTitle>
          </DialogHeader>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Procurar Digimon visível..."
            autoFocus
          />
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-1">
            {targets.map((target) => {
              const active = target.id === targetId;
              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => setTargetId(target.id)}
                  className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left ${active ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`}
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-xs">
                      {target.nickname || target.species?.name || "Digimon"}
                    </strong>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {target.species?.name} · {target.species?.stage}
                    </span>
                  </span>
                  {active && <ScanLine className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
            {!targetsQuery.isLoading && targets.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">
                Nenhum Digimon possui token nesta página.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!selected || busy} onClick={() => void scan()}>
              <ScanLine className="mr-1 h-4 w-4" /> Rolar Scan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function DigiRoleTrainingPanel({
  digimonId,
  rank,
  trainingSuccesses,
  retrainingSuccesses,
  canEdit,
  onProgressed,
}: {
  digimonId: string;
  rank: string;
  trainingSuccesses: number;
  retrainingSuccesses: number;
  canEdit: boolean;
  onProgressed: () => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState(false);
  const nextRank = nextDigiRoleRank(rank);
  const required = nextRank ? (DIGIROLE_TRAINING_REQUIRED[nextRank] ?? 0) : 0;
  const training = Math.max(0, Math.min(required, trainingSuccesses));
  const retrainingRequired = 3;
  const retraining = Math.max(0, Math.min(retrainingRequired, retrainingSuccesses));

  async function updateProgress(
    field: "training_successes" | "retraining_successes",
    value: number,
    maximum: number,
  ) {
    setBusy(true);
    try {
      const result = await table("digirole_digimons")
        .update({ [field]: Math.max(0, Math.min(maximum, value)) })
        .eq("id", digimonId);
      if (result.error) throw result.error;
      await onProgressed();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <strong className="block text-xs">Treinamento</strong>
            <span className="block text-[10px] text-muted-foreground">
              {nextRank ? `Progresso para ${nextRank}` : "Rank normal máximo"}
            </span>
          </div>
          <span className="text-xs font-black tabular-nums">
            {training}/{required}
          </span>
        </div>
        {nextRank && (
          <div className="flex items-center gap-1.5">
            <Progress
              value={required > 0 ? (training / required) * 100 : 0}
              className="h-2 flex-1"
            />
            {canEdit && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  title="Diminuir treinamento"
                  aria-label="Diminuir treinamento"
                  disabled={busy || training <= 0}
                  onClick={() => void updateProgress("training_successes", training - 1, required)}
                >
                  −
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  title="Aumentar treinamento"
                  aria-label="Aumentar treinamento"
                  disabled={busy || training >= required}
                  onClick={() => void updateProgress("training_successes", training + 1, required)}
                >
                  +
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <strong className="block text-xs">Retreino</strong>
            <span className="block text-[10px] text-muted-foreground">
              Progresso para redistribuição
            </span>
          </div>
          <span className="text-xs font-black tabular-nums">
            {retraining}/{retrainingRequired}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Progress value={(retraining / retrainingRequired) * 100} className="h-2 flex-1" />
          {canEdit && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                title="Diminuir retreino"
                aria-label="Diminuir retreino"
                disabled={busy || retraining <= 0}
                onClick={() =>
                  void updateProgress("retraining_successes", retraining - 1, retrainingRequired)
                }
              >
                −
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                title="Aumentar retreino"
                aria-label="Aumentar retreino"
                disabled={busy || retraining >= retrainingRequired}
                onClick={() =>
                  void updateProgress("retraining_successes", retraining + 1, retrainingRequired)
                }
              >
                +
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type ArchiveForm = {
  species_id: string;
  stabilized: boolean;
  pe: number;
  battles: number;
  victories: number;
  species: SpeciesSummary & { stabilization_victories: number };
};

const FORM_STAGE_ORDER: Record<string, number> = {
  "In-Training I": 0,
  "In-Training II": 1,
  Rookie: 2,
  Armor: 3,
  Hybrid: 3,
  Champion: 3,
  Ultimate: 4,
  Jogress: 4,
  Mega: 5,
  "Mega+": 6,
};

const EVOLUTION_CATALOG_FILTERS = [
  "available",
  "In-Training I",
  "In-Training II",
  "Rookie",
  "Champion",
  "Ultimate",
  "Mega",
  "Mega+",
] as const;

type EvolutionCatalogFilter = (typeof EVOLUTION_CATALOG_FILTERS)[number];

function evolutionRequirement(
  evolutionText: string | null,
  target: SpeciesSummary,
  catalog: SpeciesSummary[],
) {
  if (!evolutionText) return "Requisitos definidos pelo narrador";
  const source = evolutionText.replace(/\s+/g, " ").trim();
  const upper = source.toLocaleUpperCase("pt-BR");
  const start = upper.indexOf(target.name.toLocaleUpperCase("pt-BR"));
  if (start < 0) return "Requisitos definidos pelo narrador";
  const tail = source.slice(start + target.name.length).trim();
  const tailUpper = tail.toLocaleUpperCase("pt-BR");
  const nextRoute = catalog.reduce((nearest, entry) => {
    if (entry.id === target.id) return nearest;
    const index = tailUpper.indexOf(entry.name.toLocaleUpperCase("pt-BR"));
    return index > 0 && index < nearest ? index : nearest;
  }, tail.length);
  const requirement = tail
    .slice(0, nextRoute)
    .replace(/^[·:;|\-\s]+/, "")
    .trim();
  if (!requirement) return "Sem requisito adicional descrito";
  return requirement;
}

type EvolutionTechnique = { grade: string; field: string };

type EvolutionRequirementContext = {
  rank: string;
  pe: number;
  attrs: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  bond: number;
  battles: number;
  victories: number;
  trainingSuccesses: number;
  techniques: EvolutionTechnique[];
};

const ATTRIBUTE_REQUIREMENTS: Record<string, { id: string; label: string }> = {
  STR: { id: "strength", label: "Força" },
  DEX: { id: "dexterity", label: "Destreza" },
  VIT: { id: "vitality", label: "Vitalidade" },
  WIS: { id: "wisdom", label: "Sabedoria" },
  SPR: { id: "spirit", label: "Espírito" },
  CHA: { id: "charisma", label: "Carisma" },
};

function evolutionPeCost(stage: string) {
  return (
    (
      {
        "In-Training II": 2,
        Rookie: 5,
        Champion: 15,
        Ultimate: 25,
        Mega: 40,
        "Mega+": 40,
        Armor: 15,
        Hybrid: 15,
        Jogress: 25,
      } as Record<string, number>
    )[stage] ?? 0
  );
}

function normalizedRequirement(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR");
}

function gradeNumber(value: string) {
  return (
    ({ I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 } as Record<string, number>)[
      value.toUpperCase()
    ] ??
    (Number.parseInt(value, 10) || 0)
  );
}

const EVOLUTION_REQUIREMENTS_BY_STAGE: Record<string, number> = {
  "In-Training II": 2,
  Rookie: 3,
  Champion: 4,
  Ultimate: 5,
  Mega: 9,
};

function requiredEvolutionRequirements(stage: string, available: number) {
  const required = EVOLUTION_REQUIREMENTS_BY_STAGE[stage];
  return Math.min(required ?? available, available);
}

function evaluateEvolutionRequirement(
  text: string,
  target: SpeciesSummary,
  context: EvolutionRequirementContext,
) {
  const normalized = normalizedRequirement(text);
  const requirements: Array<{ label: string; met: boolean }> = [];
  const cost = evolutionPeCost(target.stage);
  const peCheck = { label: `${cost} PE`, met: context.pe >= cost };

  for (const [short, attr] of Object.entries(ATTRIBUTE_REQUIREMENTS)) {
    const match = normalized.match(new RegExp(`\\b${short}\\s*(\\d+)`, "i"));
    if (match)
      requirements.push({
        label: `${attr.label} ${match[1]}`,
        met: (context.attrs[attr.id] ?? 0) >= Number(match[1]),
      });
  }

  const bond = normalized.match(/VINCULO\s*(\d+)/);
  if (bond)
    requirements.push({ label: `Vínculo ${bond[1]}`, met: context.bond >= Number(bond[1]) });
  const victories = normalized.match(/(\d+)\s*VITORIAS?/);
  if (victories)
    requirements.push({
      label: `${victories[1]} vitórias`,
      met: context.victories >= Number(victories[1]),
    });
  const battles = normalized.match(/(\d+)\s*BATALHAS?/);
  if (battles)
    requirements.push({
      label: `${battles[1]} batalhas`,
      met: context.battles >= Number(battles[1]),
    });
  const training = normalized.match(/(\d+)\s*SUCESSOS?\s*(?:DE|EM)?\s*TREINO/);
  if (training)
    requirements.push({
      label: `${training[1]} sucessos de treino`,
      met: context.trainingSuccesses >= Number(training[1]),
    });

  const skills = Object.values(DIGIROLE_SKILL_GROUPS).flat();
  for (const skill of skills) {
    const skillMatch = normalized.match(
      new RegExp(
        `\\b${normalizedRequirement(skill).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\d+)`,
        "i",
      ),
    );
    if (skillMatch)
      requirements.push({
        label: `${skill} ${skillMatch[1]}`,
        met: (context.skills[skill] ?? 0) >= Number(skillMatch[1]),
      });
  }

  const techniqueMatch = normalized.match(
    /(?:(\d+)\s*)?(?:MOVE|TECNICA)(?:\s+GRAU)?\s+([IVX]+|\d+)?\s*((?:(?:DR|VB|WG|DA|DS|NSP|NSO|ME|JT)(?:\s+OU\s+)?)+)/,
  );
  if (techniqueMatch) {
    const amount = Number(techniqueMatch[1] || 1);
    const grade = techniqueMatch[2] ? gradeNumber(techniqueMatch[2]) : 0;
    const fields = techniqueMatch[3].match(/DR|VB|WG|DA|DS|NSP|NSO|ME|JT/g) ?? [];
    const eligible = context.techniques.filter((technique) => {
      const field = normalizedRequirement(technique.field);
      return (
        (!grade || gradeNumber(technique.grade) >= grade) &&
        fields.some((candidate) => field.includes(candidate))
      );
    }).length;
    requirements.push({
      label: `${amount} técnica${amount === 1 ? "" : "s"}${grade ? ` Grau ${techniqueMatch[2]}` : ""} ${fields.join("/")}`,
      met: eligible >= amount,
    });
  }

  const required = requiredEvolutionRequirements(target.stage, requirements.length);
  const [principal, ...secondary] = requirements;
  const requiredSecondary = Math.max(0, required - (principal ? 1 : 0));
  const metSecondary = secondary.filter((check) => check.met).length;
  const routeMet =
    requirements.length === 0
      ? !/MISSAO|ITEM.CHAVE|CONDICAO NARRATIVA|TRANSFORMACAO ESPECIAL/.test(normalized)
      : Boolean(principal?.met) && metSecondary >= requiredSecondary;
  const checks = [
    peCheck,
    ...(principal
      ? [{ ...principal, label: `Principal: ${principal.label}` }]
      : []),
    ...secondary.map((check, index) => ({
      ...check,
      label: `${check.label} · secundário ${index + 1}/8`,
    })),
  ];
  return {
    cost,
    checks,
    met: peCheck.met && routeMet,
  };
}

export function DigiRoleEvolutionPanel({
  gameId,
  digimonId,
  currentSpeciesId,
  currentSpeciesName,
  rank,
  pe,
  evolutionText,
  attrs,
  skills,
  bond,
  battles,
  victories,
  trainingSuccesses,
  canEdit,
  onUpdated,
}: {
  gameId: string;
  digimonId: string;
  currentSpeciesId: string | null;
  currentSpeciesName: string;
  rank: string;
  pe: number;
  evolutionText: string | null;
  attrs: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  bond: number;
  battles: number;
  victories: number;
  trainingSuccesses: number;
  canEdit: boolean;
  onUpdated: () => Promise<unknown> | void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<EvolutionCatalogFilter>("available");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formsQuery = useQuery({
    queryKey: ["digirole-forms", digimonId],
    queryFn: async (): Promise<ArchiveForm[]> => {
      let result = await table("digirole_forms")
        .select(
          "species_id,stabilized,pe,battles,victories,species:species_id(id,name,stage,image_url,stabilization_victories)",
        )
        .eq("digimon_id", digimonId)
        .order("unlocked_at");
      if (result.error && /\b(pe|battles)\b/i.test(result.error.message ?? "")) {
        result = await table("digirole_forms")
          .select(
            "species_id,stabilized,victories,species:species_id(id,name,stage,image_url,stabilization_victories)",
          )
          .eq("digimon_id", digimonId)
          .order("unlocked_at");
      }
      if (result.error) throw result.error;
      return (result.data ?? [])
        .map(
          (
            raw: Omit<ArchiveForm, "species"> & {
              species: ArchiveForm["species"] | ArchiveForm["species"][];
            },
          ) => ({
            ...raw,
            pe: raw.pe ?? 0,
            battles: raw.battles ?? 0,
            species: relation(raw.species) as ArchiveForm["species"],
          }),
        )
        .filter((entry: ArchiveForm) => !!entry.species);
    },
  });
  const catalogQuery = useQuery({
    queryKey: ["digirole-evolution-catalog"],
    enabled: open,
    queryFn: async (): Promise<SpeciesSummary[]> => {
      const pages = await Promise.all(
        [0, 1000].map((from) =>
          table("digirole_species")
            .select("id,name,stage,image_url,evolution_text")
            .order("name")
            .range(from, from + 999),
        ),
      );
      const error = pages.find((page) => page.error)?.error;
      if (error) throw error;
      return pages.flatMap((page) => page.data ?? []) as SpeciesSummary[];
    },
  });
  const techniquesQuery = useQuery({
    queryKey: ["digirole-evolution-techniques", digimonId],
    enabled: open,
    queryFn: async (): Promise<EvolutionTechnique[]> => {
      const result = await table("digirole_digimon_techniques")
        .select("technique:technique_id(grade,field)")
        .eq("digimon_id", digimonId);
      if (result.error) throw result.error;
      return (result.data ?? []).flatMap(
        (row: { technique: EvolutionTechnique | EvolutionTechnique[] | null }) =>
          Array.isArray(row.technique) ? row.technique : row.technique ? [row.technique] : [],
      );
    },
  });
  const unlocked = useMemo(
    () => new Set((formsQuery.data ?? []).map((entry) => entry.species_id)),
    [formsQuery.data],
  );
  const candidates = useMemo(() => {
    const route = (evolutionText ?? "").toLocaleUpperCase("pt-BR");
    const currentName = currentSpeciesName.toLocaleUpperCase("pt-BR");
    const currentStage =
      (catalogQuery.data ?? []).find((entry) => entry.id === currentSpeciesId)?.stage ?? rank;
    const currentOrder = FORM_STAGE_ORDER[currentStage] ?? 99;
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return (catalogQuery.data ?? [])
      .filter((entry) => !unlocked.has(entry.id) && entry.id !== currentSpeciesId)
      .filter((entry) => {
        const isNextForm = route.includes(entry.name.toLocaleUpperCase("pt-BR"));
        const isPreviousForm =
          (FORM_STAGE_ORDER[entry.stage] ?? 99) < currentOrder &&
          (entry.evolution_text ?? "").toLocaleUpperCase("pt-BR").includes(currentName);
        return isNextForm || isPreviousForm;
      })
      .filter(
        (entry) =>
          !normalizedSearch || entry.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
      )
      .sort((left, right) => {
        const leftRoute = route.includes(left.name.toLocaleUpperCase("pt-BR")) ? 0 : 1;
        const rightRoute = route.includes(right.name.toLocaleUpperCase("pt-BR")) ? 0 : 1;
        return leftRoute - rightRoute || left.name.localeCompare(right.name, "pt-BR");
      });
  }, [
    catalogQuery.data,
    currentSpeciesId,
    currentSpeciesName,
    evolutionText,
    rank,
    search,
    unlocked,
  ]);
  const selected = candidates.find((entry) => entry.id === selectedId) ?? null;

  function candidateRequirement(entry: SpeciesSummary) {
    const currentStage =
      (catalogQuery.data ?? []).find((species) => species.id === currentSpeciesId)?.stage ?? rank;
    const isPreviousForm =
      (FORM_STAGE_ORDER[entry.stage] ?? 99) < (FORM_STAGE_ORDER[currentStage] ?? 99);
    return isPreviousForm
      ? `Forma anterior ligada a ${currentSpeciesName}`
      : evolutionRequirement(evolutionText, entry, catalogQuery.data ?? []);
  }

  function candidateStatus(entry: SpeciesSummary) {
    return evaluateEvolutionRequirement(candidateRequirement(entry), entry, {
      rank,
      pe,
      attrs,
      skills,
      bond,
      battles,
      victories,
      trainingSuccesses,
      techniques: techniquesQuery.data ?? [],
    });
  }

  const filteredCandidates = candidates.filter((entry) =>
    catalogFilter === "available"
      ? candidateStatus(entry).met
      : entry.stage === catalogFilter,
  );

  async function refreshAll() {
    await Promise.all([
      formsQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] }),
      queryClient.invalidateQueries({ queryKey: ["digirole-roster"] }),
      queryClient.invalidateQueries({ queryKey: ["digirole-target-info", gameId] }),
      queryClient.invalidateQueries({
        queryKey: ["token-digirole", "digirole_digimon", digimonId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["token-digirole-stats", "digirole_digimon", digimonId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["token-digirole_digimon-status", digimonId],
      }),
      onUpdated(),
    ]);
  }

  async function unlock() {
    if (!selected) return;
    const isPreviousForm =
      (FORM_STAGE_ORDER[selected.stage] ?? 99) <
      (FORM_STAGE_ORDER[
        (catalogQuery.data ?? []).find((entry) => entry.id === currentSpeciesId)?.stage ?? rank
      ] ?? 99);
    const requirement = isPreviousForm
      ? `Forma anterior ligada a ${currentSpeciesName}`
      : evolutionRequirement(evolutionText, selected, catalogQuery.data ?? []);
    const status = evaluateEvolutionRequirement(requirement, selected, {
      rank,
      pe,
      attrs,
      skills,
      bond,
      battles,
      victories,
      trainingSuccesses,
      techniques: techniquesQuery.data ?? [],
    });
    if (!status.met) {
      toast.error("Esta forma ainda possui requisitos pendentes.");
      return;
    }
    setBusy(true);
    try {
      const result = await callRpc("unlock_digirole_form", {
        p_digimon_id: digimonId,
        p_species_id: selected.id,
        p_requirements_confirmed: true,
        p_force: false,
      });
      if (result.error) throw result.error;
      const data = result.data as { cost?: number } | null;
      toast.success(
        `${selected.name} adicionado ao DigiArchive${data?.cost ? ` por ${data.cost} PE` : ""}.`,
      );
      setOpen(false);
      setSelectedId(null);
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
      const [beforeResult, targetResult] = await Promise.all([
        table("digirole_digimons").select("attrs").eq("id", digimonId).single(),
        table("digirole_species")
          .select("id,name,base_attrs,signature_technique,image_url")
          .eq("id", form.species_id)
          .single(),
      ]);
      if (beforeResult.error) throw beforeResult.error;
      if (targetResult.error) throw targetResult.error;
      const previousAttrs = (beforeResult.data?.attrs ?? {}) as Record<string, number>;
      const targetAttrs = (targetResult.data?.base_attrs ?? {}) as Record<string, number>;
      const result = await callRpc("transform_digirole_form", {
        p_digimon_id: digimonId,
        p_species_id: form.species_id,
      });
      if (result.error) throw result.error;
      const afterResult = await table("digirole_digimons")
        .select("attrs,hp_current")
        .eq("id", digimonId)
        .single();
      if (afterResult.error) throw afterResult.error;
      const currentAttrs = (afterResult.data?.attrs ?? {}) as Record<string, number>;
      const targetImage =
        (targetResult.data?.image_url as string | null | undefined) ||
        (await fetchDigiApiImage(targetResult.data?.name as string));
      if (targetImage && !targetResult.data?.image_url) {
        const speciesImage = await table("digirole_species")
          .update({ image_url: targetImage })
          .eq("id", form.species_id);
        if (speciesImage.error) throw speciesImage.error;
      }
      const transformedValues: Record<string, unknown> = {
        image_hidden: false,
      };
      if (targetImage) transformedValues.image_url = targetImage;
      if (JSON.stringify(currentAttrs) !== JSON.stringify(targetAttrs)) {
        const vitalityDelta = (targetAttrs.vitality ?? 1) - (previousAttrs.vitality ?? 1);
        transformedValues.attrs = targetAttrs;
        transformedValues.hp_current = Math.max(
          0,
          (afterResult.data?.hp_current ?? 0) + vitalityDelta,
        );
      }
      const updated = await table("digirole_digimons")
        .update(transformedValues)
        .eq("id", digimonId);
      if (updated.error) throw updated.error;
      const signature = targetResult.data?.signature_technique as string | null | undefined;
      await syncDigiRoleSignatureTechniques({
        digimonId,
        speciesId: targetResult.data.id as string,
        signatureName: signature ?? null,
        speciesName: targetResult.data.name as string,
      });
      const data = result.data as {
        digimonDsCost?: number;
        tamerDsCost?: number;
      } | null;
      const totalCost = (data?.digimonDsCost ?? 0) + (data?.tamerDsCost ?? 0);
      toast.success(
        `${form.species.name} ativado${totalCost ? ` por ${totalCost} DS` : ""}.`,
      );
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
      const data = result.data as {
        victories?: number;
        required?: number;
        newlyStabilized?: boolean;
      } | null;
      toast.success(
        data?.newlyStabilized
          ? `${currentSpeciesName} foi estabilizado.`
          : `Vitória registrada: ${data?.victories ?? 0}/${data?.required ?? 0}.`,
      );
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
        <div className="min-w-0 flex-1">
          <strong className="block text-xs">DigiArchive</strong>
          <span className="block text-[10px] text-muted-foreground">
            {pe} PE · formas e estabilização
          </span>
        </div>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCatalogFilter("available");
              setSelectedId(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Desbloquear
          </Button>
        )}
      </div>
      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {(formsQuery.data ?? []).map((form) => {
          const active = form.species_id === currentSpeciesId;
          const formPe = active ? pe : form.pe;
          const formBattles = active ? battles : form.battles;
          const formVictories = active ? victories : form.victories;
          const required = form.species.stabilization_victories ?? 0;
          const activeStage =
            (formsQuery.data ?? []).find((entry) => entry.species_id === currentSpeciesId)?.species
              .stage ?? rank;
          const action =
            (FORM_STAGE_ORDER[form.species.stage] ?? 99) < (FORM_STAGE_ORDER[activeStage] ?? 99)
              ? "Regressão"
              : "Digievoluir";
          return (
            <div
              key={form.species_id}
              className={`flex items-center gap-2 rounded border px-2 py-2 ${active ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs">{form.species.name}</strong>
                <span className="block text-[10px] text-muted-foreground">
                  {form.species.stage} · {formPe} PE · {formBattles} batalhas · {formVictories}/
                  {required} vitórias
                </span>
              </span>
              {form.stabilized && (
                <Badge variant="secondary" className="text-[9px]">
                  Estável
                </Badge>
              )}
              {active ? (
                <Badge className="text-[9px]">Ativa</Badge>
              ) : (
                canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    title={action}
                    onClick={() => void transform(form)}
                  >
                    <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> {action}
                  </Button>
                )
              )}
              {active && canEdit && !form.stabilized && (
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={busy}
                  title="Registrar vitória nesta forma"
                  onClick={() => void victory()}
                >
                  <Trophy className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Desbloquear forma</DialogTitle>
          </DialogHeader>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Procurar forma no catálogo..."
            autoFocus
          />
          <div className="flex shrink-0 gap-1 overflow-x-auto pb-1 [scrollbar-gutter:stable]">
            {EVOLUTION_CATALOG_FILTERS.map((filter) => (
              <Button
                key={filter}
                type="button"
                size="sm"
                variant={catalogFilter === filter ? "default" : "outline"}
                className="shrink-0 px-3 text-[10px]"
                onClick={() => {
                  setCatalogFilter(filter);
                  setSelectedId(null);
                }}
              >
                {filter === "available" ? "Disponível" : filter}
              </Button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {filteredCandidates.map((entry) => {
              const active = selectedId === entry.id;
              const requirement = candidateRequirement(entry);
              const status = candidateStatus(entry);
              return (
                <button
                  type="button"
                  key={entry.id}
                  disabled={!status.met}
                  onClick={() => status.met && setSelectedId(entry.id)}
                  className={`flex w-full items-center gap-2 rounded border px-3 py-2 text-left transition-colors ${
                    status.met
                      ? active
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent"
                      : "cursor-not-allowed border-border/60 bg-muted/40 opacity-55 grayscale"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-xs">{entry.name}</strong>
                    <span className="block text-[10px] text-muted-foreground">
                      {entry.stage} · {status.cost} PE
                    </span>
                    <span className="mt-0.5 block text-[10px] text-foreground">
                      {requirement || "Sem requisito adicional descrito"}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px]">
                      {status.checks.map((check) => (
                        <span
                          key={`${entry.id}-${check.label}`}
                          className={check.met ? "text-emerald-500" : "text-destructive"}
                        >
                          {check.met ? "✓" : "✕"} {check.label}
                        </span>
                      ))}
                    </span>
                  </span>
                  {active && <Sparkles className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
            {!catalogQuery.isLoading && filteredCandidates.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">
                {catalogFilter === "available"
                  ? "Nenhuma forma disponível com os requisitos atuais."
                  : `Nenhuma forma ${catalogFilter} encontrada nesta rota evolutiva.`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!selected || busy} onClick={() => void unlock()}>
              <Sparkles className="mr-1 h-4 w-4" /> Desbloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
