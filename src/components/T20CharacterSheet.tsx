import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageSourceDialog } from "@/components/ImageSourceDialog";
import {
  T20_ATTRIBUTES,
  T20_CLASSES,
  T20_QUICK_ROLLS,
  T20_RACES,
  T20_SKILLS,
  defaultT20Attributes,
  defaultT20Skills,
  parseT20RollLines,
  type T20AttributeKey,
} from "@/lib/tormenta20";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Dices, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type JsonMap = Record<string, number>;

type T20Character = {
  id: string;
  game_id: string;
  owner_id: string;
  name: string;
  image_url: string | null;
  race: string | null;
  class_name: string | null;
  origin: string | null;
  deity: string | null;
  level: number;
  xp: number;
  attributes: JsonMap | null;
  skills: JsonMap | null;
  hp_current: number;
  hp_max: number;
  mp_current: number;
  mp_max: number;
  defense: number;
  speed: number;
  attacks: string | null;
  powers: string | null;
  spells: string | null;
  inventory: string | null;
  notes: string | null;
};

type T20Power = {
  id: string;
  game_id: string | null;
  name: string;
  category: string | null;
  cost: string | null;
  prerequisite: string | null;
  effect: string;
  source: string | null;
};

type T20Spell = {
  id: string;
  game_id: string | null;
  name: string;
  circle: string | null;
  school: string | null;
  execution: string | null;
  range_text: string | null;
  target: string | null;
  duration: string | null;
  resistance: string | null;
  cost: string | null;
  effect: string;
  source: string | null;
};

type RollMeta = {
  characterKind: "t20";
  characterId: string;
  imageUrl?: string | null;
};

export function T20CharacterSheet({
  characterId,
  gameId,
  userId,
  isNarrator,
  onRoll,
  onChat,
  onDeleted,
}: {
  characterId: string;
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onRoll: (label: string, modifier: number, penalty?: number, meta?: RollMeta) => void;
  onChat?: (body: string) => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [customRollLabel, setCustomRollLabel] = useState("Teste");
  const [customRollMod, setCustomRollMod] = useState(0);
  const { data: sheet, isLoading } = useQuery({
    queryKey: ["t20-character", characterId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("t20_characters" as never) as any)
        .select("*")
        .eq("id", characterId)
        .single();
      if (error) throw error;
      return data as T20Character;
    },
  });

  const canEdit = !!sheet && (isNarrator || sheet.owner_id === userId);
  const attrs = useMemo(
    () => ({ ...defaultT20Attributes(), ...(sheet?.attributes ?? {}) }),
    [sheet?.attributes],
  );
  const skills = useMemo(
    () => ({ ...defaultT20Skills(), ...(sheet?.skills ?? {}) }),
    [sheet?.skills],
  );
  const attackRolls = useMemo(() => parseT20RollLines(sheet?.attacks), [sheet?.attacks]);
  const spellRolls = useMemo(() => parseT20RollLines(sheet?.spells), [sheet?.spells]);

  const { data: powerCatalog = [] } = useQuery({
    queryKey: ["t20-power-catalog", gameId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("t20_powers" as never) as any)
        .select("*")
        .or(`game_id.is.null,game_id.eq.${gameId}`)
        .order("name");
      if (error) throw error;
      return (data ?? []) as T20Power[];
    },
  });
  const { data: spellCatalog = [] } = useQuery({
    queryKey: ["t20-spell-catalog", gameId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("t20_spells" as never) as any)
        .select("*")
        .or(`game_id.is.null,game_id.eq.${gameId}`)
        .order("name");
      if (error) throw error;
      return (data ?? []) as T20Spell[];
    },
  });
  const { data: knownPowers = [] } = useQuery({
    queryKey: ["t20-character-powers", characterId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("t20_character_powers" as never) as any)
        .select("notes,t20_powers(*)")
        .eq("character_id", characterId);
      if (error) throw error;
      return (data ?? []).map((row: any) => row.t20_powers).filter(Boolean) as T20Power[];
    },
  });
  const { data: knownSpells = [] } = useQuery({
    queryKey: ["t20-character-spells", characterId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("t20_character_spells" as never) as any)
        .select("notes,prepared,t20_spells(*)")
        .eq("character_id", characterId);
      if (error) throw error;
      return (data ?? []).map((row: any) => row.t20_spells).filter(Boolean) as T20Spell[];
    },
  });

  const patch = useMutation({
    mutationFn: async (partial: Partial<T20Character>) => {
      const { error } = await (supabase.from("t20_characters" as never) as any)
        .update(partial)
        .eq("id", characterId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["t20-character", characterId] });
      qc.invalidateQueries({ queryKey: ["characters", gameId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function remove() {
    if (!sheet || !canEdit) return;
    if (!confirm(`Deletar "${sheet.name}"?`)) return;
    const { error } = await (supabase.from("t20_characters" as never) as any).delete().eq("id", sheet.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["characters", gameId] });
    onDeleted?.();
  }

  function updateAttr(key: T20AttributeKey, value: number) {
    patch.mutate({ attributes: { ...attrs, [key]: value } as never });
  }

  function updateSkill(skill: string, value: number) {
    patch.mutate({ skills: { ...skills, [skill]: value } as never });
  }

  function roll(label: string, modifier: number) {
    if (!sheet) return;
    onRoll(`${sheet.name} - ${label}`, modifier, 0, {
      characterKind: "t20",
      characterId: sheet.id,
      imageUrl: sheet.image_url,
    });
  }

  async function addPower(powerId: string) {
    const { error } = await (supabase.from("t20_character_powers" as never) as any)
      .insert({ character_id: characterId, power_id: powerId });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["t20-character-powers", characterId] });
  }

  async function addSpell(spellId: string) {
    const { error } = await (supabase.from("t20_character_spells" as never) as any)
      .insert({ character_id: characterId, spell_id: spellId });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["t20-character-spells", characterId] });
  }

  async function removePower(powerId: string) {
    const { error } = await (supabase.from("t20_character_powers" as never) as any)
      .delete()
      .eq("character_id", characterId)
      .eq("power_id", powerId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["t20-character-powers", characterId] });
  }

  async function removeSpell(spellId: string) {
    const { error } = await (supabase.from("t20_character_spells" as never) as any)
      .delete()
      .eq("character_id", characterId)
      .eq("spell_id", spellId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["t20-character-spells", characterId] });
  }

  if (isLoading || !sheet) return <div className="p-4 text-sm text-muted-foreground">Carregando ficha...</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col items-center gap-2">
          {sheet.image_url ? (
            <img src={sheet.image_url} alt="" className="h-24 w-24 rounded-md border border-border object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
          {canEdit && <ImageSourceDialog title="Imagem" onPick={(url) => patch.mutate({ image_url: url })} />}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <Input
            value={sheet.name}
            disabled={!canEdit}
            onChange={(e) => patch.mutate({ name: e.target.value })}
            className="h-10 text-lg font-bold"
          />
          <div className="grid gap-2 sm:grid-cols-5">
            <SelectField label="Raca" value={sheet.race ?? ""} disabled={!canEdit} options={T20_RACES} onChange={(v) => patch.mutate({ race: v })} />
            <SelectField label="Classe" value={sheet.class_name ?? ""} disabled={!canEdit} options={T20_CLASSES} onChange={(v) => patch.mutate({ class_name: v })} />
            <TextField label="Origem" value={sheet.origin ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ origin: v })} />
            <TextField label="Divindade" value={sheet.deity ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ deity: v })} />
            <NumberField label="Nivel" value={sheet.level} disabled={!canEdit} onChange={(v) => patch.mutate({ level: v })} />
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-6">
        <NumberField label="PV" value={sheet.hp_current} disabled={!canEdit} onChange={(v) => patch.mutate({ hp_current: v })} suffix={`/${sheet.hp_max}`} />
        <NumberField label="PV max" value={sheet.hp_max} disabled={!canEdit} onChange={(v) => patch.mutate({ hp_max: v })} />
        <NumberField label="PM" value={sheet.mp_current} disabled={!canEdit} onChange={(v) => patch.mutate({ mp_current: v })} suffix={`/${sheet.mp_max}`} />
        <NumberField label="Defesa" value={sheet.defense} disabled={!canEdit} onChange={(v) => patch.mutate({ defense: v })} />
        <NumberField label="Desloc." value={sheet.speed} disabled={!canEdit} onChange={(v) => patch.mutate({ speed: v })} />
        <NumberField label="XP" value={sheet.xp} disabled={!canEdit} onChange={(v) => patch.mutate({ xp: v })} />
      </div>

      <section className="space-y-2 rounded-md border border-border bg-card p-3">
        <h3 className="text-sm font-bold">Rolagens rapidas</h3>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {T20_QUICK_ROLLS.map((item) => {
            const value = skills[item.skill] ?? 0;
            return (
              <Button
                key={item.label}
                type="button"
                size="sm"
                variant="outline"
                className="justify-between"
                onClick={() => roll(item.label, value)}
              >
                <span>{item.label}</span>
                <span className="text-xs opacity-70">{value >= 0 ? "+" : ""}{value}</span>
              </Button>
            );
          })}
        </div>
        <div className="grid gap-2 border-t border-border pt-2 sm:grid-cols-[1fr_7rem_auto]">
          <Input
            value={customRollLabel}
            disabled={!canEdit}
            onChange={(e) => setCustomRollLabel(e.target.value)}
            className="h-8"
            placeholder="Nome do teste"
          />
          <Input
            type="number"
            value={customRollMod}
            disabled={!canEdit}
            onChange={(e) => setCustomRollMod(Number(e.target.value || 0))}
            className="h-8"
          />
          <Button type="button" size="sm" onClick={() => roll(customRollLabel || "Teste", customRollMod)}>
            Rolar
          </Button>
        </div>
      </section>

      {(attackRolls.length > 0 || spellRolls.length > 0) && (
        <section className="space-y-2 rounded-md border border-border bg-card p-3">
          <h3 className="text-sm font-bold">Acoes salvas</h3>
          <div className="flex flex-wrap gap-1.5">
            {attackRolls.map((item) => (
              <Button key={`atk:${item.label}:${item.modifier}`} type="button" size="sm" variant="outline" onClick={() => roll(item.label, item.modifier)}>
                {item.label} <span className="ml-1 text-xs opacity-70">{item.modifier >= 0 ? "+" : ""}{item.modifier}</span>
              </Button>
            ))}
            {spellRolls.map((item) => (
              <Button key={`spl:${item.label}:${item.modifier}`} type="button" size="sm" variant="outline" onClick={() => roll(item.label, item.modifier)}>
                {item.label} <span className="ml-1 text-xs opacity-70">{item.modifier >= 0 ? "+" : ""}{item.modifier}</span>
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Escreva uma acao por linha em Ataques ou Magias, terminando com o bonus. Ex.: Espada longa +8
          </p>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-bold">Atributos</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {T20_ATTRIBUTES.map((a) => (
            <div key={a.key} className="rounded-md border border-border bg-card p-2">
              <button
                type="button"
                className="mb-2 flex w-full items-center justify-between text-left text-xs font-bold"
                onClick={() => roll(a.label, attrs[a.key] ?? 0)}
              >
                <span>{a.short}</span>
                <Dices className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <Input
                type="number"
                value={attrs[a.key] ?? 0}
                disabled={!canEdit}
                onChange={(e) => updateAttr(a.key, Number(e.target.value || 0))}
                className="h-8 text-center font-bold"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold">Pericias</h3>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {T20_SKILLS.map((skill) => (
            <div key={skill} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
              <button type="button" className="min-w-0 flex-1 truncate text-left text-xs font-semibold" onClick={() => roll(skill, skills[skill] ?? 0)}>
                {skill}
              </button>
              <Input
                type="number"
                value={skills[skill] ?? 0}
                disabled={!canEdit}
                onChange={(e) => updateSkill(skill, Number(e.target.value || 0))}
                className="h-7 w-16 text-center text-xs"
              />
            </div>
          ))}
        </div>
      </section>

      <CatalogSection
        title="Poderes"
        empty="Nenhum poder adicionado."
        addLabel="Adicionar poder"
        canEdit={canEdit}
        catalog={powerCatalog}
        knownIds={new Set(knownPowers.map((p) => p.id))}
        onAdd={addPower}
        onCreate={async (entry) => {
          const { data, error } = await (supabase.from("t20_powers" as never) as any)
            .insert({ ...entry, game_id: gameId, created_by: userId })
            .select()
            .single();
          if (error) throw error;
          qc.invalidateQueries({ queryKey: ["t20-power-catalog", gameId] });
          await addPower((data as { id: string }).id);
        }}
      >
        {knownPowers.map((power) => (
          <PowerCard key={power.id} power={power} canEdit={canEdit} onRemove={() => removePower(power.id)} />
        ))}
      </CatalogSection>

      <CatalogSection
        title="Magias"
        empty="Nenhuma magia adicionada."
        addLabel="Adicionar magia"
        canEdit={canEdit}
        catalog={spellCatalog}
        knownIds={new Set(knownSpells.map((s) => s.id))}
        onAdd={addSpell}
        onCreate={async (entry) => {
          const { data, error } = await (supabase.from("t20_spells" as never) as any)
            .insert({ ...entry, game_id: gameId, created_by: userId })
            .select()
            .single();
          if (error) throw error;
          qc.invalidateQueries({ queryKey: ["t20-spell-catalog", gameId] });
          await addSpell((data as { id: string }).id);
        }}
        spellMode
      >
        {knownSpells.map((spell) => (
          <SpellCard key={spell.id} spell={spell} canEdit={canEdit} onRemove={() => removeSpell(spell.id)} />
        ))}
      </CatalogSection>

      <div className="grid gap-3 lg:grid-cols-2">
        <TextAreaField label="Ataques" value={sheet.attacks ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ attacks: v })} />
        <TextAreaField label="Poderes extras" value={sheet.powers ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ powers: v })} />
        <TextAreaField label="Magias extras" value={sheet.spells ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ spells: v })} />
        <TextAreaField label="Inventario" value={sheet.inventory ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ inventory: v })} />
      </div>

      <TextAreaField label="Notas" value={sheet.notes ?? ""} disabled={!canEdit} onChange={(v) => patch.mutate({ notes: v })} rows={5} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensagem como personagem..." className="h-9 flex-1" />
        <Button
          size="sm"
          variant="outline"
          disabled={!message.trim()}
          onClick={() => {
            onChat?.(`${sheet.name}: ${message.trim()}`);
            setMessage("");
          }}
        >
          Enviar
        </Button>
        {canEdit && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Deletar
          </Button>
        )}
      </div>
    </div>
  );
}

function TextField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8" />
    </label>
  );
}

function NumberField({ label, value, disabled, onChange, suffix }: { label: string; value: number; disabled?: boolean; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Input type="number" value={value ?? 0} disabled={disabled} onChange={(e) => onChange(Number(e.target.value || 0))} className="h-8" />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </label>
  );
}

function SelectField({ label, value, disabled, options, onChange }: { label: string; value: string; disabled?: boolean; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={disabled}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">-</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

function TextAreaField({ label, value, disabled, onChange, rows = 4 }: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <textarea
        value={value}
        disabled={disabled}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm disabled:opacity-70"
      />
    </label>
  );
}

function CatalogSection<T extends { id: string; name: string; effect: string }>({
  title,
  empty,
  addLabel,
  canEdit,
  catalog,
  knownIds,
  onAdd,
  onCreate,
  spellMode = false,
  children,
}: {
  title: string;
  empty: string;
  addLabel: string;
  canEdit: boolean;
  catalog: T[];
  knownIds: Set<string>;
  onAdd: (id: string) => Promise<void>;
  onCreate: (entry: Record<string, string | null>) => Promise<void>;
  spellMode?: boolean;
  children: ReactNode;
}) {
  const available = catalog.filter((item) => !knownIds.has(item.id));
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {canEdit && (
          <CatalogAddDialog
            label={addLabel}
            available={available}
            onAdd={onAdd}
            onCreate={onCreate}
            spellMode={spellMode}
          />
        )}
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {children}
      </div>
      {(!children || (Array.isArray(children) && children.length === 0)) && (
        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function CatalogAddDialog<T extends { id: string; name: string; effect: string }>({
  label,
  available,
  onAdd,
  onCreate,
  spellMode,
}: {
  label: string;
  available: T[];
  onAdd: (id: string) => Promise<void>;
  onCreate: (entry: Record<string, string | null>) => Promise<void>;
  spellMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [cost, setCost] = useState("");
  const [detailA, setDetailA] = useState("");
  const [detailB, setDetailB] = useState("");
  const [effect, setEffect] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [busy, setBusy] = useState(false);

  async function addSelected() {
    if (!pick) return;
    setBusy(true);
    try {
      await onAdd(pick);
      setOpen(false);
      setPick("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao adicionar");
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    if (!name.trim()) { toast.error("Informe um nome"); return; }
    setBusy(true);
    try {
      await onCreate(spellMode ? {
        name: name.trim(),
        circle: category || null,
        school: detailA || null,
        execution: detailB || null,
        cost: cost || null,
        effect: effect || "",
      } : {
        name: name.trim(),
        category: category || null,
        prerequisite: detailA || null,
        cost: cost || null,
        effect: effect || "",
      });
      setOpen(false);
      setName("");
      setCategory("");
      setCost("");
      setDetailA("");
      setDetailB("");
      setEffect("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar");
    } finally {
      setBusy(false);
    }
  }

  async function importBulk() {
    const entries = parseCatalogBulk(bulkText, !!spellMode);
    if (entries.length === 0) {
      toast.error("Nenhum item valido encontrado");
      return;
    }
    setBusy(true);
    try {
      for (const entry of entries) await onCreate(entry);
      setBulkText("");
      setOpen(false);
      toast.success(`${entries.length} item(ns) importado(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="mr-1 h-3.5 w-3.5" /> {label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label className="text-xs">Selecionar do catalogo</Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger><SelectValue placeholder={available.length ? "Escolha um item" : "Catalogo vazio"} /></SelectTrigger>
              <SelectContent>
                {available.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!pick || busy} onClick={addSelected}>Adicionar selecionado</Button>
          </div>

          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <Label className="text-xs">Cadastrar novo no catalogo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={spellMode ? "Nome da magia" : "Nome do poder"} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={spellMode ? "Circulo" : "Categoria"} />
              <Input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Custo" />
              <Input value={detailA} onChange={(e) => setDetailA(e.target.value)} placeholder={spellMode ? "Escola" : "Pre-requisito"} />
              {spellMode && <Input value={detailB} onChange={(e) => setDetailB(e.target.value)} placeholder="Execucao" />}
            </div>
            <textarea
              value={effect}
              onChange={(e) => setEffect(e.target.value)}
              rows={4}
              placeholder="Efeito/descricao"
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
            />
            <Button size="sm" disabled={busy || !name.trim()} onClick={createAndAdd}>Criar e adicionar</Button>
          </div>

          <div className="space-y-2 rounded-md border border-dashed border-border p-3">
            <Label className="text-xs">Importar varios para o catalogo</Label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              placeholder={spellMode
                ? "JSON ou CSV: name,circle,school,execution,cost,effect"
                : "JSON ou CSV: name,category,prerequisite,cost,effect"}
              className="w-full rounded-md border border-border bg-background p-2 text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Aceita JSON com lista de objetos ou CSV simples com cabecalho.
            </p>
            <Button size="sm" variant="outline" disabled={busy || !bulkText.trim()} onClick={importBulk}>
              Importar lista
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseCatalogBulk(text: string, spellMode: boolean): Record<string, string | null>[] {
  const raw = text.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeCatalogEntry(item, spellMode))
        .filter((item): item is Record<string, string | null> => !!item);
    }
  } catch {
    // Falls back to CSV below.
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1)
    .map((line) => {
      const values = splitCsvLine(line);
      const obj: Record<string, string> = {};
      headers.forEach((header, index) => { obj[header] = values[index] ?? ""; });
      return normalizeCatalogEntry(obj, spellMode);
    })
    .filter((item): item is Record<string, string | null> => !!item);
}

function normalizeCatalogEntry(value: unknown, spellMode: boolean): Record<string, string | null> | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const name = String(obj.name ?? obj.nome ?? "").trim();
  if (!name) return null;
  const clean = (v: unknown) => {
    const text = String(v ?? "").trim();
    return text ? text : null;
  };
  if (spellMode) {
    return {
      name,
      circle: clean(obj.circle ?? obj.circulo),
      school: clean(obj.school ?? obj.escola),
      execution: clean(obj.execution ?? obj.execucao),
      range_text: clean(obj.range_text ?? obj.alcance),
      target: clean(obj.target ?? obj.alvo),
      duration: clean(obj.duration ?? obj.duracao),
      resistance: clean(obj.resistance ?? obj.resistencia),
      cost: clean(obj.cost ?? obj.custo),
      effect: clean(obj.effect ?? obj.efeito ?? obj.descricao) ?? "",
      source: clean(obj.source ?? obj.fonte),
    };
  }
  return {
    name,
    category: clean(obj.category ?? obj.categoria),
    prerequisite: clean(obj.prerequisite ?? obj.requisito ?? obj.pre_requisito),
    cost: clean(obj.cost ?? obj.custo),
    effect: clean(obj.effect ?? obj.efeito ?? obj.descricao) ?? "",
    source: clean(obj.source ?? obj.fonte),
  };
}

function splitCsvLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function PowerCard({ power, canEdit, onRemove }: { power: T20Power; canEdit: boolean; onRemove: () => void }) {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-bold">{power.name}</h4>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
            {power.category && <span className="rounded bg-muted px-1.5 py-0.5">{power.category}</span>}
            {power.cost && <span className="rounded bg-muted px-1.5 py-0.5">Custo: {power.cost}</span>}
            {power.prerequisite && <span className="rounded bg-muted px-1.5 py-0.5">Req: {power.prerequisite}</span>}
          </div>
        </div>
        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>
      {power.effect && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{power.effect}</p>}
    </div>
  );
}

function SpellCard({ spell, canEdit, onRemove }: { spell: T20Spell; canEdit: boolean; onRemove: () => void }) {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-bold">{spell.name}</h4>
          <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
            {spell.circle && <span className="rounded bg-muted px-1.5 py-0.5">{spell.circle}</span>}
            {spell.school && <span className="rounded bg-muted px-1.5 py-0.5">{spell.school}</span>}
            {spell.execution && <span className="rounded bg-muted px-1.5 py-0.5">Exec: {spell.execution}</span>}
            {spell.cost && <span className="rounded bg-muted px-1.5 py-0.5">Custo: {spell.cost}</span>}
            {spell.range_text && <span className="rounded bg-muted px-1.5 py-0.5">Alcance: {spell.range_text}</span>}
            {spell.duration && <span className="rounded bg-muted px-1.5 py-0.5">Duracao: {spell.duration}</span>}
          </div>
        </div>
        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>
      {spell.target && <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold">Alvo:</span> {spell.target}</p>}
      {spell.resistance && <p className="mt-1 text-xs text-muted-foreground"><span className="font-semibold">Resistencia:</span> {spell.resistance}</p>}
      {spell.effect && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{spell.effect}</p>}
    </div>
  );
}
