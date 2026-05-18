import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DotEditor } from "@/components/DotEditor";
import {
  ATTRS, SOCIAL_ATTRS, RANKS, RANK_LABELS, RANK_BONUS, SKILLS, HUMAN_ATTR_CAP, type Rank,
} from "@/lib/pokerole";
import { toast } from "sonner";
import { Dices, ImagePlus, X as XIcon } from "lucide-react";

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
};

export function TrainerSheet({
  trainerId,
  userId,
  isNarrator,
  onRoll,
}: {
  trainerId: string;
  userId: string;
  isNarrator: boolean;
  onRoll: (label: string, n: number) => void;
}) {
  const qc = useQueryClient();
  const { data: trainer } = useQuery({
    queryKey: ["trainer", trainerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("trainers").select("*").eq("id", trainerId).single();
      if (error) throw error;
      return data as Trainer;
    },
  });

  if (!trainer) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  const canEdit = trainer.owner_id === userId || isNarrator;

  async function patch(p: Partial<Trainer>) {
    const { error } = await supabase.from("trainers").update(p).eq("id", trainerId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["trainer", trainerId] });
  }

  const vit = trainer.attrs.vitality ?? 1;
  const str = trainer.attrs.strength ?? 1;
  const dex = trainer.attrs.dexterity ?? 1;
  const ins = trainer.attrs.insight ?? 1;
  const alert = trainer.skills?.Alert ?? 0;
  const hp = vit + str + RANK_BONUS[trainer.rank];
  const will = ins + RANK_BONUS[trainer.rank];
  const initiativePool = dex + alert;
  // Catch UI state (per-sheet, local)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [ballKey, setBallKey] = useState<BallKey>("pokeball");
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [catchBonus, setCatchBonus] = useState(0);
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
          {SKILLS.map((s) => {
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


      <section>
        <Label>Notes</Label>
        <Textarea value={trainer.notes} onChange={(e) => patch({ notes: e.target.value })} disabled={!canEdit} rows={4} />
      </section>
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

