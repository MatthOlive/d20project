import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, Check, Cpu, Dices, Save, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recalculateLancerEntity } from "@/lib/lancer/build-engine";
import { rollLancerCheck } from "@/lib/lancer/rules-engine";
import type { LancerBuildState, LancerCompendiumItem, LancerEntity } from "@/lib/lancer/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  entity: LancerEntity | null;
  entities: LancerEntity[];
  items: LancerCompendiumItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

const SKILLS = ["hull", "agility", "systems", "engineering"] as const;
const SKILL_LABELS = { hull: "Hull", agility: "Agility", systems: "Systems", engineering: "Engineering" };

function toggleId(values: string[], id: string, checked: boolean): string[] {
  return checked ? [...new Set([...values, id])] : values.filter((value) => value !== id);
}

function CompendiumChecklist({
  title,
  items,
  selected,
  onChange,
}: {
  title: string;
  items: LancerCompendiumItem[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase text-muted-foreground">{title}</h3>
        <span className="font-mono text-[10px] text-muted-foreground">{selected.length}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <label key={item.id} className="flex cursor-pointer items-start gap-2 border border-border bg-background/40 p-2 hover:border-cyan-400/40">
            <Checkbox checked={selected.includes(item.id)} onCheckedChange={(checked) => onChange(toggleId(selected, item.id, checked === true))} />
            <span className="min-w-0">
              <span className="block text-xs font-bold">{item.name}</span>
              {item.description && <span className="mt-0.5 block line-clamp-2 text-[10px] text-muted-foreground">{item.description}</span>}
            </span>
          </label>
        ))}
        {!items.length && <div className="col-span-full border border-dashed border-border p-3 text-xs text-muted-foreground">Importe um LCP com esta categoria.</div>}
      </div>
    </section>
  );
}

export function LancerEntityEditor({ entity, entities, items, open, onOpenChange, onSaved }: Props) {
  const [draft, setDraft] = useState<LancerBuildState | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entity || !open) return;
    setDraft(structuredClone(entity.build_state));
    setNotes(entity.current_state.notes ?? "");
  }, [entity, open]);

  const availableItems = useMemo(() => items.filter((item) => item.enabled), [items]);
  const preview = useMemo(() => {
    if (!entity || !draft) return null;
    return recalculateLancerEntity({ ...structuredClone(entity.current_state), notes }, draft, availableItems);
  }, [availableItems, draft, entity, notes]);
  if (!entity || !draft || !preview) return null;
  const activeEntity = entity;
  const calculated = preview;

  function update<K extends keyof LancerBuildState>(key: K, value: LancerBuildState[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("commit_lancer_entity_build" as never, {
        p_entity_id: activeEntity.id,
        p_expected_revision: activeEntity.revision,
        p_next_state: calculated.state,
        p_next_build: calculated.build,
        p_action_payload: { editor: activeEntity.entity_type, valid: calculated.build.validation.valid },
        p_generated_events: [{ type: "derived_stats_recalculated", payload: { valid: calculated.build.validation.valid } }],
      } as never);
      if (error) throw error;
      toast.success("Ficha e build atualizadas.");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar a build.");
    } finally {
      setSaving(false);
    }
  }

  async function rollCheck(label: string, bonus: number) {
    const result = rollLancerCheck({ bonus });
    const { error } = await supabase.rpc("record_lancer_roll" as never, {
      p_entity_id: activeEntity.id,
      p_roll_type: label,
      p_payload: {
        die: result.die,
        bonus: result.bonus,
        accuracy: result.accuracyDifficulty.accuracy,
        difficulty: result.accuracyDifficulty.difficulty,
        accuracyDifficultyDice: result.accuracyDifficulty.dice,
        accuracyDifficultyApplied: result.accuracyDifficulty.applied,
        total: result.total,
      },
    } as never);
    if (error) toast.error(error.message);
    else toast.success(`${label}: ${result.total} (d20 ${result.die}${bonus ? ` ${bonus > 0 ? "+" : ""}${bonus}` : ""})`);
  }

  const Icon = entity.entity_type === "pilot" ? UserRound : entity.entity_type === "mech" ? Bot : Cpu;
  const frames = availableItems.filter((item) => item.item_type === "frame");
  const weapons = availableItems.filter((item) => item.item_type === "weapon");
  const systems = availableItems.filter((item) => item.item_type === "system");
  const gear = availableItems.filter((item) => item.item_type === "pilot_gear");
  const armor = availableItems.filter((item) => item.item_type === "pilot_armor");
  const talents = availableItems.filter((item) => item.item_type === "talent");
  const licenses = availableItems.filter((item) => item.item_type === "license");
  const coreBonuses = availableItems.filter((item) => item.item_type === "core_bonus");
  const pilots = entities.filter((candidate) => candidate.entity_type === "pilot");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[88vh] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-md border-cyan-400/25 bg-[#0c1219] p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 uppercase">
            <Icon className="h-5 w-5 text-cyan-300" /> {entity.callsign || entity.name}
            <Badge variant={preview.build.validation.valid ? "secondary" : "destructive"} className="rounded-sm text-[9px]">
              {preview.build.validation.valid ? "BUILD VALID" : "BUILD INVALID"}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="summary" className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <TabsList className="mx-5 mt-3 grid h-9 max-w-lg grid-cols-3 rounded-md">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-0 min-h-0 overflow-auto p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <section className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>License Level</Label>
                    <Input type="number" min={0} max={12} value={draft.licenseLevel} onChange={(event) => update("licenseLevel", Math.max(0, Math.min(12, Number(event.target.value))))} />
                  </div>
                  {entity.entity_type === "pilot" && (
                    <div className="space-y-2">
                      <Label>Background</Label>
                      <Input value={draft.background ?? ""} onChange={(event) => update("background", event.target.value)} placeholder="Ex.: Colonist" />
                    </div>
                  )}
                  {entity.entity_type === "mech" && (
                    <div className="space-y-2">
                      <Label>Piloto vinculado</Label>
                      <Select value={draft.pilotId ?? "none"} onValueChange={(value) => update("pilotId", value === "none" ? null : value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="none">Nenhum</SelectItem>{pilots.map((pilot) => <SelectItem key={pilot.id} value={pilot.id}>{pilot.callsign || pilot.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {entity.entity_type === "pilot" && (
                  <div>
                    <h3 className="mb-2 text-[10px] font-black uppercase text-muted-foreground">Pilot Triggers</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {Object.entries(draft.triggerValues ?? {}).map(([name, value]) => (
                        <div key={name} className="grid grid-cols-[minmax(0,1fr)_5rem_auto_auto] gap-2">
                          <Input value={name} readOnly title="O nome do trigger vem do catálogo ou da criação manual" />
                          <Input type="number" value={value} onChange={(event) => update("triggerValues", { ...draft.triggerValues, [name]: Number(event.target.value) })} />
                          <Button size="icon" variant="outline" title={`Rolar ${name}`} onClick={() => void rollCheck(name, value)}><Dices className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => {
                            const next = { ...(draft.triggerValues ?? {}) }; delete next[name]; update("triggerValues", next);
                          }}>×</Button>
                        </div>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => {
                      const name = window.prompt("Nome do trigger");
                      if (name?.trim()) update("triggerValues", { ...(draft.triggerValues ?? {}), [name.trim()]: 2 });
                    }}>Adicionar trigger</Button>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea className="min-h-36" value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
              </section>
              <DerivedPanel state={preview.state} />
            </div>
          </TabsContent>

          <TabsContent value="build" className="mt-0 min-h-0 overflow-auto p-5">
            {entity.entity_type === "mech" ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Frame</Label>
                  <Select value={draft.frameId ?? "none"} onValueChange={(value) => update("frameId", value === "none" ? null : value)}>
                    <SelectTrigger><SelectValue placeholder="Selecione um frame" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Sem frame</SelectItem>{frames.map((frame) => <SelectItem key={frame.id} value={frame.id}>{frame.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[10px] font-black uppercase text-muted-foreground">Mech Skills (HASE)</h3>
                    <span className="font-mono text-xs">{Object.values(draft.mechSkills).reduce((sum, value) => sum + value, 0)}/{draft.licenseLevel + 2}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {SKILLS.map((skill) => <div key={skill} className="space-y-2"><Label>{SKILL_LABELS[skill]}</Label><div className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2"><Input type="number" min={0} max={6} value={draft.mechSkills[skill]} onChange={(event) => update("mechSkills", { ...draft.mechSkills, [skill]: Math.max(0, Math.min(6, Number(event.target.value))) })} /><Button size="icon" variant="outline" title={`Rolar ${SKILL_LABELS[skill]}`} onClick={() => void rollCheck(SKILL_LABELS[skill], draft.mechSkills[skill])}><Dices className="h-4 w-4" /></Button></div></div>)}
                  </div>
                </section>
                <ValidationPanel errors={preview.build.validation.errors} />
              </div>
            ) : (
              <div className="space-y-6">
                <CompendiumChecklist title="Talents" items={talents} selected={draft.talents.map((entry) => entry.id)} onChange={(values) => update("talents", values.map((id) => ({ id, rank: draft.talents.find((entry) => entry.id === id)?.rank ?? 1 })))} />
                {draft.talents.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{draft.talents.map((entry) => <label key={entry.id} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 border border-border p-2 text-xs"><span className="truncate">{talents.find((item) => item.id === entry.id)?.name ?? entry.id}</span><Input type="number" min={1} max={3} value={entry.rank} onChange={(event) => update("talents", draft.talents.map((item) => item.id === entry.id ? { ...item, rank: Math.max(1, Math.min(3, Number(event.target.value))) } : item))} /></label>)}</div>}
                <CompendiumChecklist title="Licenses" items={licenses} selected={draft.licenses.map((entry) => entry.id)} onChange={(values) => update("licenses", values.map((id) => ({ id, rank: draft.licenses.find((entry) => entry.id === id)?.rank ?? 1 })))} />
                {draft.licenses.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{draft.licenses.map((entry) => <label key={entry.id} className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2 border border-border p-2 text-xs"><span className="truncate">{licenses.find((item) => item.id === entry.id)?.name ?? entry.id}</span><Input type="number" min={1} max={3} value={entry.rank} onChange={(event) => update("licenses", draft.licenses.map((item) => item.id === entry.id ? { ...item, rank: Math.max(1, Math.min(3, Number(event.target.value))) } : item))} /></label>)}</div>}
                <CompendiumChecklist title="Core Bonuses" items={coreBonuses} selected={draft.coreBonusIds} onChange={(values) => update("coreBonusIds", values)} />
                <ValidationPanel errors={preview.build.validation.errors} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="equipment" className="mt-0 min-h-0 overflow-hidden p-5">
            <ScrollArea className="h-full pr-3">
              <div className="space-y-7">
                {entity.entity_type === "mech" ? <>
                  <CompendiumChecklist title="Weapons" items={weapons} selected={draft.weaponIds} onChange={(values) => update("weaponIds", values)} />
                  <CompendiumChecklist title="Systems" items={systems} selected={draft.systemIds} onChange={(values) => update("systemIds", values)} />
                </> : <>
                  <CompendiumChecklist title="Pilot Gear" items={gear} selected={draft.gearIds ?? []} onChange={(values) => update("gearIds", values)} />
                  <CompendiumChecklist title="Pilot Armor" items={armor} selected={draft.armorIds ?? []} onChange={(values) => update("armorIds", values)} />
                </>}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
        <DialogFooter className="border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void save()} disabled={saving}><Save className="mr-1.5 h-4 w-4" /> Salvar e recalcular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DerivedPanel({ state }: { state: LancerEntity["current_state"] }) {
  const stats = Object.entries(state.stats).filter((entry): entry is [string, number] => typeof entry[1] === "number");
  const resources = Object.entries(state.resources).filter((entry): entry is [string, { current: number; max: number }] => !!entry[1]);
  return (
    <aside className="border-l-2 border-cyan-400/30 bg-[#0e151d] p-4">
      <h3 className="text-xs font-black uppercase text-cyan-300">Derived State</h3>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {resources.map(([name, value]) => <div key={name} className="border border-border p-2"><div className="text-[9px] uppercase text-muted-foreground">{name}</div><div className="font-mono font-black">{value.current}/{value.max}</div></div>)}
        {stats.map(([name, value]) => <div key={name} className="border border-border p-2"><div className="truncate text-[9px] uppercase text-muted-foreground">{name}</div><div className="font-mono font-black">{value}</div></div>)}
      </div>
    </aside>
  );
}

function ValidationPanel({ errors }: { errors: LancerBuildState["validation"]["errors"] }) {
  if (!errors.length) return <div className="flex items-center gap-2 border-l-2 border-emerald-400 bg-emerald-400/10 p-3 text-xs text-emerald-200"><Check className="h-4 w-4" /> Build válida.</div>;
  return <div className="border-l-2 border-amber-400 bg-amber-400/10 p-3"><div className="flex items-center gap-2 text-xs font-black uppercase text-amber-200"><AlertTriangle className="h-4 w-4" /> Ajustes necessários</div><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{errors.map((error) => <li key={`${error.code}:${error.sourceId ?? ""}`}>• {error.message}</li>)}</ul></div>;
}
