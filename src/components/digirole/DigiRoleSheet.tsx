import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Dices, Heart, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { DigiRoleEvolutionPanel, DigiRoleScanPanel, DigiRoleTrainingPanel } from "@/components/digirole/DigiRoleProgression";
import { DigiRoleTechniqueRollDialog } from "@/components/digirole/DigiRoleTechniqueRollDialog";
import { emitEngineActionRolled } from "@/lib/game-engine/action-events";
import {
  DIGIROLE_ATTRS,
  DIGIROLE_CONDITIONS,
  DIGIROLE_NOTORIETY,
  DIGIROLE_SKILL_GROUPS,
  DIGIROLE_STAGES,
  defaultDigiRoleAttrs,
  defaultDigiRoleSkills,
  digiRoleDigimonDsMax,
  digiRoleDigimonHpMax,
  digiRoleFormulaPool,
  digiRoleInitiativePool,
  digiRoleTamerDsMax,
  digiRoleTamerHpMax,
  rollDigiRole,
  type DigiRoleNumbers,
  type DigiRoleRoll,
} from "@/lib/digirole";

type SheetKind = "digirole_tamer" | "digirole_digimon";

type BaseSheet = {
  id: string;
  game_id: string;
  owner_id: string;
  image_url: string | null;
  rank: string;
  attrs: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  hp_current: number;
  ds_current: number;
  conditions: string[];
  notes: string | null;
  allowed_editors: string[];
};

type TamerSheet = BaseSheet & {
  name: string;
  age: number;
  notoriety: DigiRoleNumbers;
  condensed_count: number;
  inventory: Array<{ name: string; quantity: number; description?: string }>;
  achievements: Array<{ name: string; complete?: boolean }>;
};

type Species = {
  id: string;
  name: string;
  stage: string;
  digi_attribute: string;
  species_type: string | null;
  fields: string[];
  available_fields: string[];
  hp_base: number;
  suggested_hp: number | null;
  stabilization_text: string | null;
  stabilization_victories: number;
  base_attrs: DigiRoleNumbers;
  signature_technique: string | null;
  evolution_text: string | null;
  image_url: string | null;
  source_page: number | null;
};

type DigimonSheet = BaseSheet & {
  nickname: string | null;
  tamer_id: string | null;
  species_id: string | null;
  bond: number;
  pe: number;
  battles: number;
  victories: number;
  training_successes: number;
  last_training_on: string | null;
  retraining_successes: number;
  unspent_attr_points: number;
  unspent_skill_points: number;
  condensation_bonus: number;
  stabilized_forms: number;
  evolution_state: Record<string, unknown>;
  species: Species | null;
};

type Technique = {
  id: string;
  name: string;
  origin: string;
  grade: string;
  ds_cost: number;
  field: string;
  category: string;
  target: string;
  accuracy_formula: string;
  damage_formula: string | null;
  description: string;
};

function table(name: string) {
  // Catalog tables are added by a local migration and intentionally extend the generated schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from(name as never) as any;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

async function sendDigiRoleRoll({
  gameId,
  userId,
  kind,
  characterId,
  label,
  pool,
  actionType,
  minimumSuccesses = 0,
}: {
  gameId: string;
  userId: string;
  kind: SheetKind;
  characterId: string;
  label: string;
  pool: number;
  actionType?: "move" | "reaction" | "initiative";
  minimumSuccesses?: number;
}) {
  const result = rollDigiRole(pool, pool <= 0 ? 1 : 0);
  const displayedSuccesses = Math.max(minimumSuccesses, result.successes);
  const inserted = await supabase.from("chat_messages").insert({
    game_id: gameId,
    user_id: userId,
    kind: "roll",
    body: label,
    roll_data: {
      label,
      system: "digirole",
      pool: result.pool,
      dice: result.dice,
      chanceDice: result.chanceDice,
      chance: result.chance,
      successes: displayedSuccesses,
      ...(displayedSuccesses !== result.successes ? { rawSuccesses: result.successes } : {}),
      ones: result.dice.filter((die) => die === 1).length,
    },
  });
  if (inserted.error) throw inserted.error;
  if (actionType) {
    emitEngineActionRolled({
      gameId,
      characterId,
      characterKind: kind,
      actionType,
      label,
      resultSuccesses: displayedSuccesses,
    });
  }
  return { ...result, successes: displayedSuccesses };
}

export function DigiRoleSheet({
  kind,
  characterId,
  gameId,
  userId,
  isNarrator,
  onDeleted,
}: {
  kind: SheetKind;
  characterId: string;
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onDeleted: () => void;
}) {
  return kind === "digirole_tamer" ? (
    <DigiRoleTamerSheet id={characterId} gameId={gameId} userId={userId} isNarrator={isNarrator} onDeleted={onDeleted} />
  ) : (
    <DigiRoleDigimonSheet id={characterId} gameId={gameId} userId={userId} isNarrator={isNarrator} onDeleted={onDeleted} />
  );
}

function SheetHeader({
  name,
  imageUrl,
  subtitle,
  canEdit,
  onName,
  onImage,
  onDelete,
}: {
  name: string;
  imageUrl: string | null;
  subtitle: string;
  canEdit: boolean;
  onName: (value: string) => void;
  onImage: (value: string) => void;
  onDelete: () => void;
}) {
  return (
    <header className="flex gap-4 border-b border-border p-4">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-24 w-24 shrink-0 object-contain" />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md bg-muted text-xl font-black">
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <Input value={name} readOnly={!canEdit} onChange={(event) => onName(event.target.value)} className="h-10 text-lg font-black" />
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {canEdit && (
          <Input value={imageUrl ?? ""} onChange={(event) => onImage(event.target.value)} placeholder="URL da imagem" className="h-8 text-xs" />
        )}
      </div>
      {canEdit && (
        <Button size="icon" variant="ghost" title="Excluir ficha" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </header>
  );
}

function ResourceStrip({
  hp,
  hpMax,
  ds,
  dsMax,
  canEdit,
  onHp,
  onDs,
}: {
  hp: number;
  hpMax: number;
  ds: number;
  dsMax: number;
  canEdit: boolean;
  onHp: (value: number) => void;
  onDs: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-2 border-b border-border">
      <label className="flex items-center gap-2 border-r border-border p-3">
        <Heart className="h-4 w-4 text-emerald-500" />
        <span className="text-xs font-bold">HP</span>
        <Input type="number" value={hp} readOnly={!canEdit} onChange={(event) => onHp(asNumber(event.target.value))} className="ml-auto h-8 w-20" />
        <span className="text-xs text-muted-foreground">/{hpMax}</span>
      </label>
      <label className="flex items-center gap-2 p-3">
        <Sparkles className="h-4 w-4 text-cyan-400" />
        <span className="text-xs font-bold">DS</span>
        <Input type="number" value={ds} readOnly={!canEdit} onChange={(event) => onDs(asNumber(event.target.value))} className="ml-auto h-8 w-20" />
        <span className="text-xs text-muted-foreground">/{dsMax}</span>
      </label>
    </div>
  );
}

function AttributeGrid({
  values,
  canEdit,
  onChange,
}: {
  values: DigiRoleNumbers;
  canEdit: boolean;
  onChange: (values: DigiRoleNumbers) => void;
}) {
  return (
    <section className="p-4">
      <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Atributos</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {DIGIROLE_ATTRS.map((attr) => (
          <label key={attr.id} className="flex min-w-0 flex-col items-center gap-1 rounded-md border border-border p-2">
            <span className="text-[10px] font-black text-primary">{attr.short}</span>
            <Input
              type="number"
              min={0}
              value={values[attr.id] ?? 1}
              readOnly={!canEdit}
              onChange={(event) => onChange({ ...values, [attr.id]: asNumber(event.target.value, 1) })}
              className="h-8 w-full text-center text-base font-black"
            />
            <span className="truncate text-[9px] text-muted-foreground">{attr.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function SkillGrid({
  values,
  canEdit,
  onChange,
}: {
  values: DigiRoleNumbers;
  canEdit: boolean;
  onChange: (values: DigiRoleNumbers) => void;
}) {
  return (
    <section className="border-t border-border p-4">
      <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Perícias</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(DIGIROLE_SKILL_GROUPS).map(([group, skills]) => (
          <div key={group}>
            <h4 className="mb-1 text-[10px] font-black uppercase text-primary">{group}</h4>
            <div className="grid grid-cols-2 gap-1">
              {skills.map((skill) => (
                <label key={skill} className="flex items-center gap-2 rounded border border-border px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{skill}</span>
                  <Input
                    type="number"
                    min={0}
                    value={values[skill] ?? 0}
                    readOnly={!canEdit}
                    onChange={(event) => onChange({ ...values, [skill]: asNumber(event.target.value) })}
                    className="h-7 w-14 text-center"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RollBuilder({
  name,
  attrs,
  skills,
  onRoll,
}: {
  name: string;
  attrs: DigiRoleNumbers;
  skills: DigiRoleNumbers;
  onRoll: (label: string, pool: number) => void;
}) {
  const [attr, setAttr] = useState("dexterity");
  const [skill, setSkill] = useState("Alert");
  const attrMeta = DIGIROLE_ATTRS.find((entry) => entry.id === attr)!;
  const pool = (attrs[attr] ?? 0) + (skills[skill] ?? 0);
  return (
    <section className="border-y border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Dices className="h-4 w-4 text-primary" />
        <Select value={attr} onValueChange={setAttr}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{DIGIROLE_ATTRS.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.short} · {entry.label}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-xs font-black">+</span>
        <Select value={skill} onValueChange={setSkill}>
          <SelectTrigger className="h-8 min-w-44 flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.values(DIGIROLE_SKILL_GROUPS).flat().map((entry) => <SelectItem key={entry} value={entry}>{entry}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" onClick={() => onRoll(`${name} · ${attrMeta.short} + ${skill}`, pool)}>
          Rolar {pool > 0 ? `${pool}d6` : "Chance"}
        </Button>
      </div>
    </section>
  );
}

function Conditions({ values, canEdit, onChange }: { values: string[]; canEdit: boolean; onChange: (values: string[]) => void }) {
  return (
    <section className="border-t border-border p-4">
      <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Condições</h3>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {DIGIROLE_CONDITIONS.map((condition) => (
          <label key={condition} className="flex items-center gap-2 rounded border border-border px-2 py-1.5 text-[11px]">
            <Checkbox
              checked={values.includes(condition)}
              disabled={!canEdit}
              onCheckedChange={(checked) => onChange(checked ? [...values, condition] : values.filter((entry) => entry !== condition))}
            />
            {condition}
          </label>
        ))}
      </div>
    </section>
  );
}

function DigiRoleTamerSheet({ id, gameId, userId, isNarrator, onDeleted }: { id: string; gameId: string; userId: string; isNarrator: boolean; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["digirole-tamer", id],
    queryFn: async () => {
      const result = await table("digirole_tamers").select("*").eq("id", id).single();
      if (result.error) throw result.error;
      return result.data as TamerSheet;
    },
  });
  const [draft, setDraft] = useState<TamerSheet | null>(null);
  useEffect(() => { if (query.data) setDraft(query.data); }, [query.data]);
  if (query.isLoading || !draft) return <div className="p-5 text-sm text-muted-foreground">Carregando Tamer...</div>;
  if (query.error) return <div className="p-5 text-sm text-destructive">{messageOf(query.error)}</div>;
  const canEdit = isNarrator || draft.owner_id === userId || draft.allowed_editors.includes(userId);
  const hpMax = digiRoleTamerHpMax(draft.attrs);
  const dsMax = digiRoleTamerDsMax(draft.attrs, draft.condensed_count);

  async function patch(values: Partial<TamerSheet>) {
    setDraft((current) => current ? { ...current, ...values } : current);
    const result = await table("digirole_tamers").update(values).eq("id", id).select("id").maybeSingle();
    if (result.error) toast.error(messageOf(result.error));
  }
  async function remove() {
    if (!confirm("Excluir este Tamer?")) return;
    const result = await table("digirole_tamers").delete().eq("id", id);
    if (result.error) return toast.error(messageOf(result.error));
    void queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
    onDeleted();
  }
  async function roll(label: string, pool: number, actionType?: "reaction" | "initiative"): Promise<DigiRoleRoll | null> {
    try { return await sendDigiRoleRoll({ gameId, userId, kind: "digirole_tamer", characterId: id, label, pool, actionType }); }
    catch (error) { toast.error(messageOf(error)); return null; }
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <SheetHeader
        name={draft.name}
        imageUrl={draft.image_url}
        subtitle={`Tamer · ${draft.rank} · ${draft.age} anos`}
        canEdit={canEdit}
        onName={(name) => void patch({ name })}
        onImage={(image_url) => void patch({ image_url: image_url || null })}
        onDelete={() => void remove()}
      />
      <ResourceStrip hp={draft.hp_current} hpMax={hpMax} ds={draft.ds_current} dsMax={dsMax} canEdit={canEdit} onHp={(hp_current) => void patch({ hp_current })} onDs={(ds_current) => void patch({ ds_current })} />
      <div className="flex flex-wrap items-end gap-2 p-3">
        <label className="space-y-1"><span className="block text-[10px] font-bold uppercase text-muted-foreground">Idade</span><Input type="number" value={draft.age} readOnly={!canEdit} onChange={(event) => void patch({ age: asNumber(event.target.value) })} className="h-8 w-24" /></label>
        <label className="min-w-44 flex-1 space-y-1"><span className="block text-[10px] font-bold uppercase text-muted-foreground">Rank</span><Select value={draft.rank} disabled={!canEdit} onValueChange={(rank) => void patch({ rank })}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent>{DIGIROLE_STAGES.slice(0, 6).map((stage) => <SelectItem key={stage} value={stage}>{stage}</SelectItem>)}</SelectContent></Select></label>
        <label className="space-y-1"><span className="block text-[10px] font-bold uppercase text-muted-foreground">Condensados</span><Input type="number" value={draft.condensed_count} readOnly={!canEdit} onChange={(event) => void patch({ condensed_count: asNumber(event.target.value) })} className="h-8 w-24" /></label>
        <Button size="sm" variant="outline" onClick={() => void roll(`${draft.name} · Iniciativa`, digiRoleInitiativePool(draft.attrs, draft.skills), "initiative")}><Zap className="mr-1 h-3.5 w-3.5" /> Iniciativa</Button>
      </div>
      <RollBuilder name={draft.name} attrs={draft.attrs} skills={draft.skills} onRoll={(label, pool) => void roll(label, pool)} />
      <AttributeGrid values={draft.attrs || defaultDigiRoleAttrs()} canEdit={canEdit} onChange={(attrs) => void patch({ attrs })} />
      <SkillGrid values={draft.skills || defaultDigiRoleSkills()} canEdit={canEdit} onChange={(skills) => void patch({ skills })} />
      <DigiRoleScanPanel gameId={gameId} tamerId={id} canEdit={canEdit} scanPool={(draft.attrs.wisdom ?? 0) + (draft.skills.Science ?? 0)} onRoll={(label, pool) => roll(label, pool)} />
      <section className="border-t border-border p-4">
        <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Notoriedade</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{DIGIROLE_NOTORIETY.map((entry) => <label key={entry} className="rounded border border-border p-2 text-[10px] font-bold"><span className="block truncate">{entry}</span><Input type="number" value={draft.notoriety?.[entry] ?? 0} readOnly={!canEdit} onChange={(event) => void patch({ notoriety: { ...draft.notoriety, [entry]: asNumber(event.target.value) } })} className="mt-1 h-8" /></label>)}</div>
      </section>
      <Conditions values={draft.conditions ?? []} canEdit={canEdit} onChange={(conditions) => void patch({ conditions })} />
      <section className="border-t border-border p-4"><Label>Inventário</Label><Textarea value={(draft.inventory ?? []).map((item) => `${item.quantity}x ${item.name}${item.description ? ` · ${item.description}` : ""}`).join("\n")} readOnly={!canEdit} onChange={(event) => void patch({ inventory: event.target.value.split("\n").filter(Boolean).map((line) => ({ name: line.replace(/^\d+x\s*/i, ""), quantity: Number(line.match(/^(\d+)x/i)?.[1] ?? 1) })) })} className="mt-2 min-h-28" /></section>
      <section className="border-t border-border p-4"><Label>Anotações</Label><Textarea value={draft.notes ?? ""} readOnly={!canEdit} onChange={(event) => void patch({ notes: event.target.value })} className="mt-2 min-h-32" /></section>
    </div>
  );
}

function DigiRoleDigimonSheet({ id, gameId, userId, isNarrator, onDeleted }: { id: string; gameId: string; userId: string; isNarrator: boolean; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["digirole-digimon", id],
    queryFn: async () => {
      const result = await table("digirole_digimons")
        .select("*,species:species_id(*)")
        .eq("id", id)
        .single();
      if (result.error) throw result.error;
      return result.data as DigimonSheet;
    },
  });
  const techniqueQuery = useQuery({
    queryKey: ["digirole-digimon-techniques", id],
    queryFn: async (): Promise<Technique[]> => {
      const result = await table("digirole_digimon_techniques").select("technique:technique_id(*)").eq("digimon_id", id);
      if (result.error) throw result.error;
      return (result.data ?? []).flatMap((row: { technique: Technique | Technique[] | null }) =>
        Array.isArray(row.technique) ? row.technique : row.technique ? [row.technique] : [],
      );
    },
  });
  const [draft, setDraft] = useState<DigimonSheet | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  useEffect(() => { if (query.data) setDraft(query.data); }, [query.data]);
  const catalogQuery = useQuery({
    queryKey: ["digirole-technique-catalog", catalogSearch],
    enabled: catalogOpen,
    queryFn: async () => {
      let builder = table("digirole_techniques").select("*").order("name").limit(100);
      if (catalogSearch.trim()) builder = builder.ilike("name", `%${catalogSearch.trim()}%`);
      const result = await builder;
      if (result.error) throw result.error;
      return (result.data ?? []) as Technique[];
    },
  });
  if (query.isLoading || !draft) return <div className="p-5 text-sm text-muted-foreground">Carregando Digimon...</div>;
  if (query.error) return <div className="p-5 text-sm text-destructive">{messageOf(query.error)}</div>;
  const canEdit = isNarrator || draft.owner_id === userId || draft.allowed_editors.includes(userId);
  const species = draft.species;
  const name = draft.nickname || species?.name || "Digimon";
  const hpMax = digiRoleDigimonHpMax(species?.hp_base ?? 3, draft.attrs);
  const dsMax = digiRoleDigimonDsMax(draft.attrs, draft.stabilized_forms);

  async function patch(values: Partial<DigimonSheet>) {
    setDraft((current) => current ? { ...current, ...values } : current);
    const clean = { ...values } as Record<string, unknown>;
    delete clean.species;
    const result = await table("digirole_digimons").update(clean).eq("id", id).select("id").maybeSingle();
    if (result.error) toast.error(messageOf(result.error));
  }
  async function remove() {
    if (!confirm("Excluir este Digimon?")) return;
    const result = await table("digirole_digimons").delete().eq("id", id);
    if (result.error) return toast.error(messageOf(result.error));
    void queryClient.invalidateQueries({ queryKey: ["digirole-files", gameId] });
    onDeleted();
  }
  async function roll(label: string, pool: number, actionType?: "move" | "reaction" | "initiative"): Promise<DigiRoleRoll | null> {
    try { return await sendDigiRoleRoll({ gameId, userId, kind: "digirole_digimon", characterId: id, label, pool, actionType }); }
    catch (error) { toast.error(messageOf(error)); return null; }
  }
  async function learn(technique: Technique) {
    const result = await table("digirole_digimon_techniques").upsert({ digimon_id: id, technique_id: technique.id, source: "learned" });
    if (result.error) return toast.error(messageOf(result.error));
    setCatalogOpen(false);
    void techniqueQuery.refetch();
  }
  async function forget(techniqueId: string) {
    const result = await table("digirole_digimon_techniques").delete().eq("digimon_id", id).eq("technique_id", techniqueId);
    if (result.error) return toast.error(messageOf(result.error));
    void techniqueQuery.refetch();
  }
  return (
    <div className="h-full overflow-y-auto bg-background">
      <SheetHeader
        name={draft.nickname ?? ""}
        imageUrl={draft.image_url || species?.image_url || null}
        subtitle={`${species?.name || "Espécie livre"} · ${draft.rank} · ${species?.digi_attribute || "None"} · ${species?.fields.join(", ") || "Neutra"}`}
        canEdit={canEdit}
        onName={(nickname) => void patch({ nickname: nickname || null })}
        onImage={(image_url) => void patch({ image_url: image_url || null })}
        onDelete={() => void remove()}
      />
      <ResourceStrip hp={draft.hp_current} hpMax={hpMax} ds={draft.ds_current} dsMax={dsMax} canEdit={canEdit} onHp={(hp_current) => void patch({ hp_current })} onDs={(ds_current) => void patch({ ds_current })} />
      <div className="flex flex-wrap gap-1.5 p-3">
        <Button size="sm" variant="outline" onClick={() => void roll(`${name} · Iniciativa`, digiRoleInitiativePool(draft.attrs, draft.skills), "initiative")}><Zap className="mr-1 h-3.5 w-3.5" /> Iniciativa</Button>
        <Button size="sm" variant="outline" onClick={() => void roll(`${name} · Evasion`, (draft.attrs.dexterity ?? 0) + (draft.skills.Evasion ?? 0), "reaction")}><Activity className="mr-1 h-3.5 w-3.5" /> Evasion</Button>
        <Button size="sm" variant="outline" onClick={() => void roll(`${name} · Clash`, (draft.attrs.strength ?? 0) + (draft.skills.Clash ?? 0), "reaction")}><Activity className="mr-1 h-3.5 w-3.5" /> Clash</Button>
      </div>
      <RollBuilder name={name} attrs={draft.attrs} skills={draft.skills} onRoll={(label, pool) => void roll(label, pool)} />
      <AttributeGrid values={draft.attrs || species?.base_attrs || defaultDigiRoleAttrs()} canEdit={canEdit} onChange={(attrs) => void patch({ attrs })} />
      <SkillGrid values={draft.skills || defaultDigiRoleSkills()} canEdit={canEdit} onChange={(skills) => void patch({ skills })} />
      <section className="border-t border-border p-4">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-black uppercase text-muted-foreground">Técnicas</h3>{canEdit && <Button size="sm" variant="outline" onClick={() => setCatalogOpen(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Adicionar</Button>}</div>
        <div className="space-y-2">
          {(techniqueQuery.data ?? []).map((technique: Technique) => {
            const accuracy = digiRoleFormulaPool(technique.accuracy_formula, draft.attrs, draft.skills);
            const damage = technique.damage_formula ? digiRoleFormulaPool(technique.damage_formula, draft.attrs, draft.skills) : 0;
            return (
              <article key={technique.id} className="rounded-md border border-border p-3">
                <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h4 className="font-black">{technique.name}</h4><p className="text-[10px] text-muted-foreground">Grau {technique.grade || "-"} · {technique.field} · {technique.category} · {technique.target} · {technique.ds_cost} DS</p></div>{canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void forget(technique.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}</div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{technique.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <DigiRoleTechniqueRollDialog technique={technique} gameId={gameId} userId={userId} digimonId={id} digimonName={name} imageUrl={draft.image_url || species?.image_url || null} digiAttribute={species?.digi_attribute ?? "None"} accuracyPool={accuracy} damagePool={damage} dsCurrent={draft.ds_current} onDsChanged={(ds_current) => setDraft((current) => current ? { ...current, ds_current } : current)} />
                </div>
              </article>
            );
          })}
          {!techniqueQuery.isLoading && (techniqueQuery.data?.length ?? 0) === 0 && <p className="text-xs text-muted-foreground">Nenhuma técnica adicionada.</p>}
        </div>
      </section>
      <section className="border-t border-border p-4">
        <h3 className="mb-2 text-xs font-black uppercase text-muted-foreground">Progressão</h3>
        <DigiRoleTrainingPanel digimonId={id} name={name} rank={draft.rank} trainingSuccesses={draft.training_successes} lastTrainingOn={draft.last_training_on} attrs={draft.attrs} skills={draft.skills} canEdit={canEdit} onRoll={(label, pool) => roll(label, pool)} onProgressed={() => query.refetch()} />
        <DigiRoleEvolutionPanel gameId={gameId} digimonId={id} currentSpeciesId={draft.species_id} currentSpeciesName={species?.name ?? name} rank={draft.rank} pe={draft.pe} evolutionText={species?.evolution_text ?? null} canEdit={canEdit} isNarrator={isNarrator} onUpdated={() => Promise.all([query.refetch(), techniqueQuery.refetch()])} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(["bond", "pe", "battles", "victories", "training_successes", "stabilized_forms"] as const).map((field) => <label key={field} className="text-[10px] font-bold uppercase text-muted-foreground">{field.replaceAll("_", " ")}<Input type="number" value={draft[field]} readOnly={!canEdit} onChange={(event) => void patch({ [field]: asNumber(event.target.value) })} className="mt-1 h-8 text-foreground" /></label>)}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">Pontos disponíveis: {draft.unspent_attr_points ?? 0} de Atributos · {draft.unspent_skill_points ?? 0} de Perícias{draft.condensation_bonus ? ` · +${draft.condensation_bonus} da condensação` : ""}</p>
        {species?.stabilization_text && <p className="mt-3 text-xs text-muted-foreground"><strong>Estabilização:</strong> {species.stabilization_text}</p>}
        {species?.evolution_text && <p className="mt-2 text-xs leading-relaxed text-muted-foreground"><strong>Rotas:</strong> {species.evolution_text}</p>}
      </section>
      <Conditions values={draft.conditions ?? []} canEdit={canEdit} onChange={(conditions) => void patch({ conditions })} />
      <section className="border-t border-border p-4"><Label>Anotações</Label><Textarea value={draft.notes ?? ""} readOnly={!canEdit} onChange={(event) => void patch({ notes: event.target.value })} className="mt-2 min-h-32" /></section>

      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader><DialogTitle>Adicionar técnica</DialogTitle></DialogHeader>
          <Input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Procurar entre 1.104 técnicas..." autoFocus />
          <div className="min-h-0 space-y-1 overflow-y-auto">
            {(catalogQuery.data ?? []).map((technique) => <button key={technique.id} type="button" onClick={() => void learn(technique)} className="flex w-full items-center gap-2 rounded border border-border px-3 py-2 text-left hover:bg-accent"><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{technique.name}</strong><span className="block truncate text-[10px] text-muted-foreground">{technique.grade || "-"} · {technique.field} · {technique.category} · {technique.origin || "Genérica"}</span></span><Plus className="h-4 w-4" /></button>)}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCatalogOpen(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
