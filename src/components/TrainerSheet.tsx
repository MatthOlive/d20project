import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DotEditor } from "@/components/DotEditor";
import {
  ATTRS, SOCIAL_ATTRS, RANKS, RANK_LABELS, RANK_BONUS, TRAINER_SKILLS, HUMAN_ATTR_CAP, type Rank,
} from "@/lib/pokerole";
import { useDebouncedPatch } from "@/lib/use-debounced-patch";
import { toast } from "sonner";
import { Dices, ImagePlus, X as XIcon, Plus, Trash2 } from "lucide-react";

const POKEBALLS = {
  pokeball:  { label: "Pokéball",  pool: 4 },
  greatball: { label: "Greatball", pool: 6 },
  ultraball: { label: "Ultraball", pool: 8 },
  masterball:{ label: "Master Ball (auto)", pool: 0 },
} as const;
type BallKey = keyof typeof POKEBALLS;

type Trainer = {
  id: string;
  game_id: string;
  owner_id: string;
  name: string;
  nature: string | null;
  age: number | null;
  concept: string | null;
  confidence: number;
  rank: Rank;
  attrs: Record<string, number>;
  social_attrs: Record<string, number>;
  skills: Record<string, number>;
  notes: string;
  image_url: string | null;
  money: number;
  background: string | null;
  bag: string;
  battle_items: string;
  pokedex: Record<string, { name: string; captured: boolean; sprite_url?: string | null }>;
};

export function TrainerSheet({
  trainerId,
  userId,
  isNarrator,
  onRoll,
  onDeleted,
}: {
  trainerId: string;
  userId: string;
  isNarrator: boolean;
  onRoll: (label: string, n: number) => void;
  onDeleted?: () => void;
}) {
  const [ballKey, setBallKey] = useState<BallKey>("pokeball");
  const [catchBonus, setCatchBonus] = useState(0);
  const queryKey = useMemo(() => ["trainer", trainerId], [trainerId]);
  const { data: trainer } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("trainers").select("*").eq("id", trainerId).single();
      if (error) throw error;
      return data as unknown as Trainer;
    },
  });

  const commit = useCallback(async (p: Partial<Trainer>) => {
    const { error } = await supabase.from("trainers").update(p).eq("id", trainerId);
    if (error) toast.error(error.message);
  }, [trainerId]);
  const { patch } = useDebouncedPatch<Trainer>(queryKey, commit);

  if (!trainer) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  const canEdit = trainer.owner_id === userId || isNarrator;

  const vit = trainer.attrs.vitality ?? 1;
  const str = trainer.attrs.strength ?? 1;
  const dex = trainer.attrs.dexterity ?? 1;
  const ins = trainer.attrs.insight ?? 1;
  const alert = trainer.skills?.Alert ?? 0;
  const hp = vit + str + RANK_BONUS[trainer.rank];
  const will = ins + 2;
  const initiativePool = dex + alert;
  const ball = POKEBALLS[ballKey];
  const catchPool = ball.pool;

  return (
    <div className="space-y-5 p-4">
      <TrainerImage trainer={trainer} canEdit={canEdit} onChange={(url) => patch({ image_url: url })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={trainer.name} onChange={(e) => patch({ name: e.target.value })} disabled={!canEdit} />
        </div>
        <div className="space-y-2">
          <Label>Concept</Label>
          <Input value={trainer.concept ?? ""} onChange={(e) => patch({ concept: e.target.value })} disabled={!canEdit} />
        </div>
        <div className="space-y-2">
          <Label>Nature</Label>
          <NatureSelect
            value={trainer.nature}
            disabled={!canEdit}
            onChange={(nature, conf) => patch({ nature, confidence: conf })}
          />
        </div>
        <div className="space-y-2">
          <Label>Age</Label>
          <Input
            type="number" value={trainer.age ?? ""}
            onChange={(e) => patch({ age: parseInt(e.target.value) || null })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>Rank</Label>
          <Select value={trainer.rank} onValueChange={(v) => patch({ rank: v as Rank })} disabled={!canEdit}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANKS.map((r) => <SelectItem key={r} value={r}>{RANK_LABELS[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Confidence</Label>
          <Input
            type="number" value={trainer.confidence}
            onChange={(e) => patch({ confidence: parseInt(e.target.value) || 0 })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2">
          <Label>Money (₽)</Label>
          <Input
            type="number" value={trainer.money}
            onChange={(e) => patch({ money: parseInt(e.target.value) || 0 })}
            disabled={!canEdit}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Background</Label>
          <Textarea
            value={trainer.background ?? ""}
            onChange={(e) => patch({ background: e.target.value })}
            disabled={!canEdit}
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-success/15 px-3 py-1 text-sm font-bold text-success">HP {hp}</span>
          <span className="rounded-full bg-accent px-3 py-1 text-sm font-bold">Will {will}</span>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold" title="Defense = Vitality">Def {vit}</span>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold" title="Special Defense = Vitality">Sp.Def {vit}</span>
          <Button size="sm" variant="outline" className="h-7"
            onClick={() => onRoll(`${trainer.name} · Initiative (Dex+Alert)`, initiativePool)}>
            <Dices className="mr-1 h-3.5 w-3.5" /> Initiative · {initiativePool}d6
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Catch</span>
          <Select value={ballKey} onValueChange={(v) => setBallKey(v as BallKey)}>
            <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(POKEBALLS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label} · {v.pool}d6</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            +bonus
            <Input type="number" min={0} max={3} value={catchBonus}
              onChange={(e) => setCatchBonus(Math.max(0, Math.min(3, parseInt(e.target.value) || 0)))}
              className="h-7 w-12 text-xs" />
          </label>
          <Button size="sm" variant="outline" className="h-7"
            disabled={ballKey === "masterball"}
            onClick={() => onRoll(
              `${trainer.name} · Catch (${ball.label}${catchBonus ? ` +${catchBonus}` : ""})`,
              catchPool,
            )}>
            <Dices className="mr-1 h-3.5 w-3.5" />
            {ballKey === "masterball" ? "Auto-catch" : `Catch · ${catchPool}d6${catchBonus ? ` +${catchBonus}` : ""}`}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Bonus successes: +1 if target at half HP, +1 at 1 HP, +1 with a status ailment (max +3, lost if fainted).
          Required successes — Starter 3 · Beginner 4 · Amateur 6 · Ace 8 · Pro 9.
        </p>
      </div>


      <section>
        <h3 className="mb-2 text-sm font-bold">Attributes <span className="text-muted-foreground font-normal">(max {HUMAN_ATTR_CAP})</span></h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {ATTRS.map((a) => {
            const v = trainer.attrs[a] ?? 1;
            return (
              <div key={a} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                <span className="w-24 text-sm font-medium capitalize">{a}</span>
                <DotEditor
                  value={v}
                  max={HUMAN_ATTR_CAP}
                  onChange={(n) => patch({ attrs: { ...trainer.attrs, [a]: n } })}
                  disabled={!canEdit}
                />
                <Button size="sm" variant="ghost" className="ml-1 h-7 px-2" onClick={() => onRoll(`${trainer.name} · ${a}`, v)}>
                  <Dices className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
          {SOCIAL_ATTRS.map((a) => {
            const v = trainer.social_attrs?.[a] ?? 1;
            return (
              <div key={a} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                <span className="w-24 text-sm font-medium capitalize">{a}</span>
                <DotEditor
                  value={v}
                  max={HUMAN_ATTR_CAP}
                  onChange={(n) => patch({ social_attrs: { ...trainer.social_attrs, [a]: n } })}
                  disabled={!canEdit}
                />
                <Button size="sm" variant="ghost" className="ml-1 h-7 px-2" onClick={() => onRoll(`${trainer.name} · ${a}`, v)}>
                  <Dices className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold">Skills</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {TRAINER_SKILLS.map((s) => {
            const v = trainer.skills[s] ?? 0;
            return (
              <div key={s} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                <span className="text-sm">{s}</span>
                <DotEditor
                  value={v}
                  max={5}
                  onChange={(n) => patch({ skills: { ...trainer.skills, [s]: n } })}
                  disabled={!canEdit}
                />
              </div>
            );
          })}
        </div>
      </section>


      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Bag (general items)</Label>
          <Textarea
            value={trainer.bag ?? ""}
            onChange={(e) => patch({ bag: e.target.value })}
            disabled={!canEdit}
            rows={4}
            placeholder="Potions, Pokéballs, Repels…"
          />
        </div>
        <div>
          <Label>Battle items</Label>
          <Textarea
            value={trainer.battle_items ?? ""}
            onChange={(e) => patch({ battle_items: e.target.value })}
            disabled={!canEdit}
            rows={4}
            placeholder="X-Attack, Guard Spec, held items…"
          />
        </div>
      </section>

      <PokedexSection
        trainer={trainer}
        canEdit={canEdit}
        onChange={(pokedex) => patch({ pokedex })}
      />



      <section>
        <Label>Notes</Label>
        <Textarea value={trainer.notes} onChange={(e) => patch({ notes: e.target.value })} disabled={!canEdit} rows={4} />
      </section>

      {canEdit && (
        <section className="flex justify-end border-t border-border pt-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (!confirm(`Delete trainer "${trainer.name}"? This cannot be undone.`)) return;
              const { error } = await supabase.from("trainers").delete().eq("id", trainerId);
              if (error) { toast.error(error.message); return; }
              toast.success("Trainer deleted");
              onDeleted?.();
            }}
          >
            <XIcon className="mr-1 h-3.5 w-3.5" /> Delete trainer
          </Button>
        </section>
      )}
    </div>
  );
}

function TrainerImage({
  trainer, canEdit, onChange,
}: {
  trainer: Trainer;
  canEdit: boolean;
  onChange: (url: string | null) => void;
}) {
  function upload(file: File) {
    if (file.size > 2_000_000) { toast.error("Image must be under 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }
  return (
    <div className="flex items-center gap-4">
      {trainer.image_url ? (
        <img src={trainer.image_url} alt={trainer.name} className="h-24 w-24 rounded-xl border border-border bg-muted object-cover" />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-xs text-muted-foreground">No image</div>
      )}
      {canEdit && (
        <div className="flex flex-col gap-1.5">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent">
            <ImagePlus className="h-3.5 w-3.5" /> {trainer.image_url ? "Replace" : "Upload"} image
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          {trainer.image_url && (
            <button
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
            ><XIcon className="h-3.5 w-3.5" /> Remove</button>
          )}
        </div>
      )}
    </div>
  );
}

type Nature = {
  id: string;
  name: string;
  keywords: string;
  description: string;
  confidence: number;
};

function NatureSelect({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  onChange: (nature: string, confidence: number) => void;
}) {
  const { data: natures = [] } = useQuery({
    queryKey: ["natures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("natures")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Nature[];
    },
  });

  const current = natures.find((n) => n.name === value);

  return (
    <div className="space-y-1">
      <Select
        value={value ?? ""}
        onValueChange={(name) => {
          const n = natures.find((x) => x.name === name);
          if (n) onChange(n.name, n.confidence);
        }}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Choose a nature…" />
        </SelectTrigger>
        <SelectContent>
          {natures.map((n) => (
            <SelectItem key={n.id} value={n.name}>
              <span className="font-medium">{n.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{n.keywords}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current && (
        <p className="text-xs text-muted-foreground">{current.description}</p>
      )}
    </div>
  );
}


type PokedexEntry = { name: string; captured: boolean; sprite_url?: string | null };

function PokedexSection({
  trainer,
  canEdit,
  onChange,
}: {
  trainer: Trainer;
  canEdit: boolean;
  onChange: (pokedex: Record<string, PokedexEntry>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const pokedex = (trainer.pokedex ?? {}) as Record<string, PokedexEntry>;
  const entries = Object.entries(pokedex).sort((a, b) => a[1].name.localeCompare(b[1].name));

  const { data: speciesList = [] } = useQuery({
    queryKey: ["species-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("species")
        .select("id,name,dex_number,sprite_url")
        .order("dex_number", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return speciesList.filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [speciesList, search]);

  function addSpecies(s: { id: string; name: string; sprite_url: string | null }) {
    if (pokedex[s.id]) { toast.info(`${s.name} already in Pokédex`); return; }
    onChange({ ...pokedex, [s.id]: { name: s.name, captured: false, sprite_url: s.sprite_url } });
  }
  function toggleCaptured(id: string) {
    onChange({ ...pokedex, [id]: { ...pokedex[id], captured: !pokedex[id].captured } });
  }
  function removeEntry(id: string) {
    const next = { ...pokedex }; delete next[id]; onChange(next);
  }

  const seen = entries.length;
  const caught = entries.filter(([, e]) => e.captured).length;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">Pokédex <span className="text-muted-foreground font-normal">· Seen {seen} · Caught {caught}</span></h3>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No Pokémon recorded yet.</p>
      ) : (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {entries.map(([id, e]) => (
            <div key={id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
              {e.sprite_url ? (
                <img src={e.sprite_url} alt={e.name} className="h-8 w-8 object-contain" />
              ) : (
                <div className="h-8 w-8 rounded bg-muted" />
              )}
              <span className="flex-1 text-sm">{e.name}</span>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={e.captured}
                  onCheckedChange={() => canEdit && toggleCaptured(id)}
                  disabled={!canEdit}
                />
                Caught
              </label>
              {canEdit && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeEntry(id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-hidden">
          <DialogHeader><DialogTitle>Add Pokémon to Pokédex</DialogTitle></DialogHeader>
          <Input placeholder="Search species…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
            {filtered.map((s) => {
              const added = !!pokedex[s.id];
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => addSpecies(s)}
                  disabled={added}
                  className="flex w-full items-center gap-2 border-b border-border px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
                >
                  {s.sprite_url ? (
                    <img src={s.sprite_url} alt={s.name} className="h-8 w-8 object-contain" />
                  ) : <div className="h-8 w-8 rounded bg-muted" />}
                  <span className="flex-1 text-sm">
                    {s.dex_number ? <span className="text-muted-foreground">#{String(s.dex_number).padStart(3, "0")} </span> : null}
                    {s.name}
                  </span>
                  {added && <span className="text-xs text-muted-foreground">Added</span>}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No species found.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
