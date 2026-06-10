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
import { AttrFourField, SkillNumberInput } from "@/components/AttrFourField";
import {
  ATTRS, SOCIAL_ATTRS, RANKS, RANK_LABELS, RANK_BONUS, TRAINER_SKILLS, HUMAN_ATTR_CAP, type Rank,
} from "@/lib/pokerole";
import {
  CONTEST_RANKS, CONTEST_RANK_LABELS, CONTEST_RANK_UP, NEXT_CONTEST_RANK,
  NOTORIETY_SKILLS, NOTORIETY_CAP,
} from "@/lib/contest";

import { useDebouncedPatch } from "@/lib/use-debounced-patch";
import { toast } from "sonner";
import { Dices, ImagePlus, X as XIcon, Plus, Trash2, Award } from "lucide-react";
import {
  HpAndStatusBlock, AttackRollButton, GenericRollButton, painPenaltyFor,
} from "@/components/SheetRolls";
import { SheetPermissionsDialog } from "@/components/SheetPermissionsDialog";

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
  sex: string | null;
  nature: string | null;
  age: number | null;
  concept: string | null;
  confidence: number;
  rank: Rank;
  attrs: Record<string, number>;
  attr_points: Record<string, number>;
  attr_bonus: Record<string, number>;
  social_attrs: Record<string, number>;
  social_attr_points: Record<string, number>;
  social_attr_bonus: Record<string, number>;
  skills: Record<string, number>;
  custom_skills: CustomSkill[];
  badges: Badge[];
  notes: string;
  image_url: string | null;
  money: number;
  background: string | null;
  bag: string;
  battle_items: string;
  bag_list: InventoryItem[];
  battle_items_list: InventoryItem[];
  potions: Record<string, { count: number; used: number; max: number }>;
  achievements: Achievement[];
  pokedex: Record<string, { name: string; captured: boolean; sprite_url?: string | null }>;
  current_hp: number | null;
  current_will: number | null;
  status_conditions: string[];
  contest_rank: string;
  notoriety: Record<string, number>;
  trainings: Record<string, number>;
  retrains: number;
};

type CustomSkill = { name: string; value: number };
type Badge = { name: string; image_url?: string | null };

type InventoryItem = { name: string; qty: number };
type Achievement = { name: string; done: boolean; kind?: "rank" | "custom" | "contest_rank"; rankFor?: string };

// Requisitos para alcançar CADA rank (chave = rank de destino).
// Quando o treinador está em X, mostramos os requisitos da chave NEXT_RANK[X].
const RANK_UP_REQUIREMENTS: Record<string, { label: string; items: string[] }> = {
  beginner: {
    label: "Beginner",
    items: [
      "Successfully understand your Pokémon's gestures",
      "Train a Pokémon",
      "Catch your second Pokémon",
      "Win your first Official Battle against a Trainer",
    ],
  },
  amateur: {
    label: "Amateur",
    items: [
      "Evolve a Pokémon",
      "Win your First Badge",
      "Increase a Pokémon's Loyalty & Happiness",
    ],
  },
  ace: {
    label: "Ace",
    items: [
      "Win 8 Badges",
      "Get a full party of six evolved Pokémon",
      "Defeat your Rival",
    ],
  },
  pro: {
    label: "Pro",
    items: [
      "Get a Pokémon-related job",
      "Clear the Victory Road",
      "Catch a Professional-Rank Pokémon",
    ],
  },
  master: {
    label: "Master",
    items: [
      "Find and study all Pokémon species in your Region",
    ],
  },
  champion: {
    label: "Champion",
    items: ["Defeat the Champion in the League's Challenge"],
  },
};

const NEXT_RANK: Record<string, string> = {
  starter: "beginner",
  beginner: "amateur",
  amateur: "ace",
  ace: "pro",
  pro: "master",
  master: "champion",
};


const POTION_TIERS: { key: string; label: string; defaultMax: number }[] = [
  { key: "potion", label: "Potion", defaultMax: 2 },
  { key: "super", label: "Super Potion", defaultMax: 4 },
  { key: "hyper", label: "Hyper Potion", defaultMax: 14 },
  { key: "max", label: "Max Potion", defaultMax: 20 },
];

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
  onRoll: (label: string, n: number, penalty?: number, meta?: { characterKind: "trainer" | "pokemon"; characterId: string; imageUrl?: string | null }) => void;
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

  // Trainer attributes have a base value of 1 (per Pokérole 2 rules).
  const totalAttr = (k: string) =>
    1 + (trainer.attr_points?.[k] ?? 0) + (trainer.attr_bonus?.[k] ?? 0);
  const totalSocial = (k: string) =>
    1 + (trainer.social_attr_points?.[k] ?? 0) + (trainer.social_attr_bonus?.[k] ?? 0);

  const vit = totalAttr("vitality");
  const str = totalAttr("strength");
  const dex = totalAttr("dexterity");
  const ins = totalAttr("insight");
  const alert = trainer.skills?.Alert ?? 0;
  const hp = 4 + vit;
  const currentHp = trainer.current_hp ?? hp;
  const painPenalty = painPenaltyFor(currentHp, hp);
  const will = ins + 2;
  const currentWill = trainer.current_will ?? will;
  const initiativePool = dex + alert;
  const ball = POKEBALLS[ballKey];
  const catchPool = ball.pool;

  const attackSkillOptions = [
    { name: "Brawl", value: trainer.skills?.Brawl ?? 0 },
    { name: "Throw", value: trainer.skills?.Throw ?? 0 },
    { name: "Weapons", value: trainer.skills?.Weapons ?? 0 },
  ];
  const allAttrsForRoll = [
    ...ATTRS.map((a) => ({ name: a, value: totalAttr(a) })),
    ...SOCIAL_ATTRS.map((a) => ({ name: a, value: totalSocial(a) })),
  ];
  const allSkillsForRoll = [
    ...TRAINER_SKILLS.map((s) => ({ name: s, value: trainer.skills?.[s] ?? 0 })),
    ...NOTORIETY_SKILLS.map((s) => ({ name: s, value: trainer.notoriety?.[s] ?? 0 })),
    ...(trainer.custom_skills ?? []).map((c) => ({ name: c.name, value: c.value ?? 0 })),
  ];
  const charName = trainer.name;

  const evasionPool = dex + (trainer.skills?.Evasion ?? 0);
  const clashPool = str + (trainer.skills?.Clash ?? 0);

  return (
    <div className="space-y-4 p-4">
      {/* ============ BLOCO 1 — Identidade ============ */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b-2 border-primary bg-primary/10 px-3 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Pokémon League · Trainer Card</span>
          <span className="ml-auto text-[11px] uppercase text-muted-foreground">Rank</span>
          <Select value={trainer.rank} onValueChange={(v) => patch({ rank: v as Rank })} disabled={!canEdit}>
            <SelectTrigger className="h-6 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANKS.map((r) => <SelectItem key={r} value={r}>{RANK_LABELS[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 p-3 sm:grid-cols-[160px_1fr]">
          {/* Left: image + money */}
          <div className="space-y-2">
            <TrainerImage trainer={trainer} canEdit={canEdit} onChange={(url) => patch({ image_url: url })} />
            <div className="rounded-md border border-border bg-background px-2 py-1.5">
              <Label className="text-[10px] uppercase text-muted-foreground">Money</Label>
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-primary">₽</span>
                <Input
                  type="number" value={trainer.money}
                  onChange={(e) => patch({ money: parseInt(e.target.value) || 0 })}
                  disabled={!canEdit}
                  className="h-7 text-sm"
                />
              </div>
            </div>
          </div>
          {/* Right: identity + bars + actions */}
          <div className="space-y-2">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Name</Label>
              <div className="flex items-center gap-2">
                <Input value={trainer.name} onChange={(e) => patch({ name: e.target.value })} disabled={!canEdit} className="h-9 text-base font-bold" />
                <SheetPermissionsDialog kind="trainer" entityId={trainerId} gameId={trainer.game_id} isNarrator={isNarrator} />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Sex</Label>
                <Select value={trainer.sex ?? ""} onValueChange={(v) => patch({ sex: v || null })} disabled={!canEdit}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="nonbinary">Non-binary</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Age</Label>
                <Input
                  type="number" value={trainer.age ?? ""}
                  onChange={(e) => patch({ age: parseInt(e.target.value) || null })}
                  disabled={!canEdit}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Confidence</Label>
                <Input
                  type="number" value={trainer.confidence}
                  onChange={(e) => patch({ confidence: parseInt(e.target.value) || 0 })}
                  disabled={!canEdit}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Nature</Label>
              <NatureSelect
                value={trainer.nature}
                disabled={!canEdit}
                onChange={(nature, conf) => patch({ nature, confidence: conf })}
              />
            </div>
            {/* Action row */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Button size="sm" variant="outline" className="h-7"
                onClick={() => onRoll(`${charName} · Initiative (Dex+Alert)`, initiativePool, painPenalty, { characterKind: "trainer", characterId: trainerId, imageUrl: trainer.image_url })}>
                <Dices className="mr-1 h-3.5 w-3.5" /> Initiative · {initiativePool}d6
              </Button>
              <AttackRollButton
                characterName={charName}
                attrLabel="Dexterity"
                attrValue={dex}
                skillOptions={attackSkillOptions}
                painPenalty={painPenalty}
                onRoll={onRoll}
              />
              <Button size="sm" variant="outline" className="h-7"
                onClick={() => onRoll(`${charName} · Evasion (Dex+Evasion)`, evasionPool, painPenalty)}>
                <Dices className="mr-1 h-3.5 w-3.5" /> Evasion · {evasionPool}d6
              </Button>
              <Button size="sm" variant="outline" className="h-7"
                onClick={() => onRoll(`${charName} · Clash (Str+Clash)`, clashPool, painPenalty)}>
                <Dices className="mr-1 h-3.5 w-3.5" /> Clash · {clashPool}d6
              </Button>
              <GenericRollButton
                characterName={charName}
                attrs={allAttrsForRoll}
                skills={allSkillsForRoll}
                painPenalty={painPenalty}
                onRoll={onRoll}
              />
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-1">
                <Select value={ballKey} onValueChange={(v) => setBallKey(v as BallKey)}>
                  <SelectTrigger className="h-6 w-32 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(POKEBALLS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label} · {v.pool}d6</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-col items-center">
                  <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Bônus</span>
                  <Input type="number" min={0} max={3} value={catchBonus} title="Bonus"
                    onChange={(e) => setCatchBonus(Math.max(0, Math.min(3, parseInt(e.target.value) || 0)))}
                    className="h-7 w-14 text-center text-sm font-bold" />
                </div>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                  disabled={ballKey === "masterball"}
                  onClick={() => onRoll(
                    `${trainer.name} · Catch (${ball.label}${catchBonus ? ` +${catchBonus}` : ""})`,
                    catchPool,
                    -catchBonus,
                  )}>
                  <Dices className="mr-1 h-3 w-3" />
                  {ballKey === "masterball" ? "Auto" : `Catch · ${catchPool}d6`}
                </Button>

              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Catch bonuses: +1 alvo a meio HP, +1 a 1 HP, +1 com status (máx +3). Sucessos: Starter 3 · Beginner 4 · Amateur 6 · Ace 8 · Pro 9.
            </p>
          </div>
        </div>
      </section>

      {/* ============ BLOCO 2 — Status + Atributos físicos + Sociais ============ */}
      <section className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status problems</h4>
          <HpAndStatusBlock
            current={currentHp}
            max={hp}
            status={trainer.status_conditions ?? []}
            painPenalty={painPenalty}
            canEdit={canEdit}
            onHpChange={(n) => patch({ current_hp: n })}
            onStatusChange={(s) => patch({ status_conditions: s })}
            will={currentWill}
            willMax={will}
            onWillChange={(n) => patch({ current_will: n })}
          />
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-primary">Physical</h4>
          <div className="space-y-1.5">
            {ATTRS.map((a) => (
              <AttrFourField
                key={a}
                label={a}
                base={1}
                points={trainer.attr_points?.[a] ?? 0}
                bonus={trainer.attr_bonus?.[a] ?? 0}
                baseEditable
                hideBase
                disabled={!canEdit}
                cap={HUMAN_ATTR_CAP}
                onChange={(d) => {
                  if (d.base !== undefined) patch({ attrs: { ...trainer.attrs, [a]: d.base } });
                  if (d.points !== undefined) patch({ attr_points: { ...trainer.attr_points, [a]: d.points } });
                  if (d.bonus !== undefined) patch({ attr_bonus: { ...trainer.attr_bonus, [a]: d.bonus } });
                }}
              />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-500">Social</h4>
          <div className="space-y-1.5">
            {SOCIAL_ATTRS.map((a) => (
              <AttrFourField
                key={a}
                label={a}
                base={1}
                points={trainer.social_attr_points?.[a] ?? 0}
                bonus={trainer.social_attr_bonus?.[a] ?? 0}
                baseEditable
                hideBase
                disabled={!canEdit}
                cap={HUMAN_ATTR_CAP}
                onChange={(d) => {
                  if (d.base !== undefined) patch({ social_attrs: { ...trainer.social_attrs, [a]: d.base } });
                  if (d.points !== undefined) patch({ social_attr_points: { ...trainer.social_attr_points, [a]: d.points } });
                  if (d.bonus !== undefined) patch({ social_attr_bonus: { ...trainer.social_attr_bonus, [a]: d.bonus } });
                }}
              />
            ))}
          </div>
        </div>
      </section>


      {/* ============ BLOCO 3 — Skills (Fight / Survival / Social / Knowledge / Custom) ============ */}
      <section className="rounded-lg border border-border bg-card p-3">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-primary">Skills</h3>
        <div className="grid gap-3 lg:grid-cols-6">
          <SkillGroup title="Fight" tint="bg-primary/15 text-primary"
            skills={["Brawl", "Throw", "Evasion", "Weapons"]}
            values={trainer.skills} canEdit={canEdit}
            onChange={(s) => patch({ skills: { ...trainer.skills, ...s } })} />
          <SkillGroup title="Survival" tint="bg-emerald-500/15 text-emerald-500"
            skills={["Alert", "Athletic", "Nature", "Stealth"]}
            values={trainer.skills} canEdit={canEdit}
            onChange={(s) => patch({ skills: { ...trainer.skills, ...s } })} />
          <SkillGroup title="Social" tint="bg-pink-500/15 text-pink-500"
            skills={["Allure", "Etiquette", "Intimidate", "Perform"]}
            values={trainer.skills} canEdit={canEdit}
            onChange={(s) => patch({ skills: { ...trainer.skills, ...s } })} />
          <SkillGroup title="Knowledge" tint="bg-sky-500/15 text-sky-500"
            skills={["Crafts", "Lore", "Medicine", "Science"]}
            values={trainer.skills} canEdit={canEdit}
            onChange={(s) => patch({ skills: { ...trainer.skills, ...s } })} />
          <SkillGroup title="Notoriety" tint="bg-amber-500/15 text-amber-500"
            skills={[...NOTORIETY_SKILLS]}
            values={trainer.notoriety ?? {}} canEdit={canEdit}
            onChange={(s) => {
              const merged = { ...(trainer.notoriety ?? {}), ...s };
              for (const k of Object.keys(merged)) merged[k] = Math.max(0, Math.min(NOTORIETY_CAP, merged[k] ?? 0));
              patch({ notoriety: merged });
            }} />
          <CustomSkillsSection
            items={trainer.custom_skills ?? []}
            canEdit={canEdit}
            onChange={(items) => patch({ custom_skills: items })}
          />
        </div>
      </section>

      {/* ============ BLOCO 4 — Inventário (Potions, Bag, Battle items) ============ */}
      <section className="grid gap-3 lg:grid-cols-3">
        <PotionsBlock
          potions={trainer.potions ?? {}}
          canEdit={canEdit}
          onChange={(potions) => patch({ potions })}
        />
        <ItemListSection
          title="Bag"
          items={trainer.bag_list ?? []}
          canEdit={canEdit}
          onChange={(items) => patch({ bag_list: items })}
          placeholder="Item…"
        />
        <ItemListSection
          title="Battle items"
          items={trainer.battle_items_list ?? []}
          canEdit={canEdit}
          onChange={(items) => patch({ battle_items_list: items })}
          placeholder="X-Attack…"
        />
      </section>

      {/* ============ BLOCO 5 — Contest ============ */}
      <ContestSection
        contestRank={trainer.contest_rank ?? ""}
        achievements={trainer.achievements ?? []}
        canEdit={canEdit}
        onRankChange={(r) => patch({ contest_rank: r })}
        onAchievements={(items) => patch({ achievements: items })}
      />

      {/* ============ BLOCO 6 — Badges + Achievements ============ */}
      <section className="grid gap-3 lg:grid-cols-2">
        <BadgesSection
          items={trainer.badges ?? []}
          canEdit={canEdit}
          onChange={(items) => patch({ badges: items })}
        />
        <AchievementsSection
          items={trainer.achievements ?? []}
          rank={trainer.rank}
          canEdit={canEdit}
          onChange={(items) => patch({ achievements: items })}
        />
      </section>

      {/* ============ BLOCO 7 — Pokédex ============ */}
      <PokedexSection
        trainer={trainer}
        canEdit={canEdit}
        onChange={(pokedex) => patch({ pokedex })}
      />

      <section className="space-y-2">
        <Label>Background</Label>
        <Textarea value={trainer.background ?? ""} onChange={(e) => patch({ background: e.target.value })} disabled={!canEdit} rows={2} />
        <Label>Notes</Label>
        <Textarea value={trainer.notes} onChange={(e) => patch({ notes: e.target.value })} disabled={!canEdit} rows={3} />
      </section>

      {canEdit && (
        <section className="flex justify-end gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const { data: row, error: fetchErr } = await supabase.from("trainers").select("*").eq("id", trainerId).single();
              if (fetchErr || !row) { toast.error(fetchErr?.message ?? "Falha ao copiar"); return; }
              const { id: _id, created_at: _c, updated_at: _u, ...rest } = row as Record<string, unknown>;
              void _id; void _c; void _u;
              const copy = { ...rest, name: `${(row as { name?: string }).name ?? "Trainer"} (cópia)` };
              const { error } = await supabase.from("trainers").insert(copy as never);
              if (error) { toast.error(error.message); return; }
              toast.success("Treinador duplicado");
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Duplicar ficha
          </Button>
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

function SkillGroup({
  title, tint, skills, values, canEdit, onChange,
}: {
  title: string;
  tint: string;
  skills: string[];
  values: Record<string, number>;
  canEdit: boolean;
  onChange: (partial: Record<string, number>) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className={`mb-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tint}`}>{title}</div>
      <div className="space-y-1.5">
        {skills.map((s) => {
          const v = values?.[s] ?? 0;
          return (
            <div key={s} className="flex items-center justify-between gap-2">
              <span className="text-xs">{s}</span>
              <SkillNumberInput value={v} onChange={(n) => onChange({ [s]: n })} disabled={!canEdit} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CustomSkillsSection({
  items, canEdit, onChange,
}: {
  items: CustomSkill[];
  canEdit: boolean;
  onChange: (items: CustomSkill[]) => void;
}) {
  function add() {
    onChange([...(items ?? []), { name: "New skill", value: 0 }]);
  }
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">Custom</div>
        {canEdit && (
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={add} title="Add custom skill">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        {(items ?? []).length === 0 && (
          <p className="text-[10px] text-muted-foreground">No custom skills.</p>
        )}
        {(items ?? []).map((it, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={it.name}
              disabled={!canEdit}
              onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              className="h-6 flex-1 text-xs"
            />
            <SkillNumberInput
              value={it.value}
              onChange={(n) => onChange(items.map((x, j) => j === i ? { ...x, value: n } : x))}
              disabled={!canEdit}
            />
            {canEdit && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                onClick={() => onChange(items.filter((_, j) => j !== i))}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BadgesSection({
  items, canEdit, onChange,
}: {
  items: Badge[];
  canEdit: boolean;
  onChange: (items: Badge[]) => void;
}) {
  function add() {
    onChange([...(items ?? []), { name: "New badge" }]);
  }
  function uploadImage(idx: number, file: File) {
    if (file.size > 1_000_000) { toast.error("Image must be under 1 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => onChange(items.map((x, j) => j === idx ? { ...x, image_url: reader.result as string } : x));
    reader.readAsDataURL(file);
  }
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Badges</h3>
        {canEdit && (
          <Button size="sm" variant="outline" className="h-7" onClick={add}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>
      {(items ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">No badges yet.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {(items ?? []).map((b, i) => (
            <div key={i} className="group flex flex-col items-center gap-1 rounded-md border border-border bg-background p-1.5">
              {b.image_url ? (
                <img src={b.image_url} alt={b.name} className="h-10 w-10 object-contain" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-muted-foreground">★</div>
              )}
              <Input
                value={b.name}
                disabled={!canEdit}
                onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                className="h-5 w-full text-center text-[10px]"
              />
              {canEdit && (
                <div className="flex w-full gap-0.5">
                  <label className="flex-1 cursor-pointer rounded bg-muted px-1 py-0.5 text-center text-[9px] hover:bg-accent">
                    img
                    <input type="file" accept="image/*" className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadImage(i, e.target.files[0])} />
                  </label>
                  <button
                    onClick={() => onChange(items.filter((_, j) => j !== i))}
                    className="rounded bg-muted px-1 py-0.5 text-[9px] hover:bg-destructive hover:text-destructive-foreground"
                  >×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
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
    <div className="flex flex-col items-start gap-2">
      {trainer.image_url ? (
        <img src={trainer.image_url} alt={trainer.name} className="h-24 w-24 rounded-xl border border-border bg-muted object-cover" />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-xs text-muted-foreground">No image</div>
      )}
      {canEdit && (
        <div className="flex w-full flex-wrap gap-1.5">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-accent">
            <ImagePlus className="h-3 w-3" /> {trainer.image_url ? "Replace" : "Upload"}
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
          {trainer.image_url && (
            <button
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-accent"
            ><XIcon className="h-3 w-3" /> Remove</button>
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

function ItemListSection({
  title, items, canEdit, onChange, placeholder, embedded,
}: {
  title: string;
  items: InventoryItem[];
  canEdit: boolean;
  onChange: (items: InventoryItem[]) => void;
  placeholder?: string;
  embedded?: boolean;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  function add() {
    const n = name.trim();
    if (!n) return;
    onChange([...items, { name: n, qty: Math.max(1, qty) }]);
    setName(""); setQty(1);
  }
  function update(idx: number, patch: Partial<InventoryItem>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  return (
    <section className={embedded ? "" : ""}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="space-y-1.5 rounded-md border border-border bg-card p-2">
        {items.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">No items.</p>
        )}
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={it.name}
              onChange={(e) => update(i, { name: e.target.value })}
              disabled={!canEdit}
              className="h-7 flex-1 text-sm"
            />
            <Input
              type="number" min={0}
              value={it.qty}
              onChange={(e) => update(i, { qty: parseInt(e.target.value) || 0 })}
              disabled={!canEdit}
              className="h-7 w-14 text-center text-sm"
            />
            {canEdit && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => remove(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <div className="flex items-center gap-1.5 pt-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder={placeholder ?? "Item…"}
              className="h-7 flex-1 text-sm"
            />
            <Input
              type="number" min={1} value={qty}
              onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              className="h-7 w-14 text-center text-sm"
            />
            <Button size="sm" variant="outline" className="h-7" onClick={add}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function PotionsBlock({
  potions, canEdit, onChange,
}: {
  potions: Record<string, { count: number; used: number; max: number }>;
  canEdit: boolean;
  onChange: (p: Record<string, { count: number; used: number; max: number }>) => void;
}) {
  function update(key: string, field: "count" | "used" | "max", val: number) {
    const tier = POTION_TIERS.find((t) => t.key === key);
    const cur = potions[key] ?? { count: 0, used: 0, max: tier?.defaultMax ?? 0 };
    onChange({ ...potions, [key]: { ...cur, [field]: Math.max(0, val) } });
  }
  return (
    <section>
      <h3 className="mb-2 text-sm font-bold">Potions</h3>
      <div className="space-y-1 rounded-md border border-border bg-card p-2">
        <div className="grid grid-cols-[1fr_repeat(3,minmax(0,3.5rem))] items-center gap-1.5 px-1 text-[10px] font-semibold uppercase text-muted-foreground">
          <span></span><span className="text-center">Count</span><span className="text-center">Used</span><span className="text-center">Max</span>
        </div>
        {POTION_TIERS.map((tier) => {
          const v = potions[tier.key] ?? { count: 0, used: 0, max: tier.defaultMax };
          return (
            <div key={tier.key} className="grid grid-cols-[1fr_repeat(3,minmax(0,3.5rem))] items-center gap-1.5">
              <span className="text-xs font-medium">{tier.label}</span>
              <Input type="number" min={0} value={v.count} disabled={!canEdit}
                onChange={(e) => update(tier.key, "count", parseInt(e.target.value) || 0)}
                className="h-7 text-center text-xs" />
              <Input type="number" min={0} value={v.used} disabled={!canEdit}
                onChange={(e) => update(tier.key, "used", parseInt(e.target.value) || 0)}
                className="h-7 text-center text-xs" />
              <Input type="number" min={0} value={v.max} disabled={!canEdit}
                onChange={(e) => update(tier.key, "max", parseInt(e.target.value) || 0)}
                className="h-7 text-center text-xs" />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AchievementsSection({
  items, rank, canEdit, onChange,
}: {
  items: Achievement[];
  rank: string;
  canEdit: boolean;
  onChange: (items: Achievement[]) => void;
}) {
  const [name, setName] = useState("");
  const nextRankKey = NEXT_RANK[rank];
  const rankReq = nextRankKey ? RANK_UP_REQUIREMENTS[nextRankKey] : undefined;

  // Build rank-up achievements for the NEXT rank, preserving done state from existing items
  const rankItems: Achievement[] = rankReq
    ? rankReq.items.map((n) => {
        const existing = items.find((a) => a.kind === "rank" && a.rankFor === nextRankKey && a.name === n);
        return { name: n, done: existing?.done ?? false, kind: "rank", rankFor: nextRankKey };
      })
    : [];
  const customItems = items.filter((a) => a.kind !== "rank" && a.kind !== "contest_rank");
  const contestItems = items.filter((a) => a.kind === "contest_rank");

  function updateRankDone(idx: number, done: boolean) {
    const newRank = rankItems.map((x, j) => (j === idx ? { ...x, done } : x));
    onChange([...newRank, ...contestItems, ...customItems]);
  }
  function updateCustom(next: Achievement[]) {
    onChange([...rankItems, ...contestItems, ...next.map((x) => ({ ...x, kind: "custom" as const }))]);
  }
  function add() {
    const n = name.trim(); if (!n) return;
    updateCustom([...customItems, { name: n, done: false }]);
    setName("");
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-bold">Achievements</h3>
      <div className="space-y-1.5 rounded-md border border-border bg-card p-2">
        {rankReq && (
          <div className="space-y-1.5 rounded border border-dashed border-border/60 bg-muted/30 p-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Para subir para {rankReq.label} Rank
            </p>
            {rankItems.map((a, i) => (
              <div key={`r-${i}`} className="flex items-center gap-2">
                <Checkbox
                  checked={a.done}
                  disabled={!canEdit}
                  onCheckedChange={() => updateRankDone(i, !a.done)}
                />
                <span className={`flex-1 text-sm ${a.done ? "line-through text-muted-foreground" : ""}`}>
                  {a.name}
                </span>
              </div>
            ))}
          </div>
        )}


        {customItems.length === 0 && !rankReq && (
          <p className="px-1 text-xs text-muted-foreground">No achievements yet.</p>
        )}
        {customItems.map((a, i) => (
          <div key={`c-${i}`} className="flex items-center gap-2">
            <Checkbox
              checked={a.done}
              disabled={!canEdit}
              onCheckedChange={() => updateCustom(customItems.map((x, j) => j === i ? { ...x, done: !x.done } : x))}
            />
            <Input
              value={a.name}
              disabled={!canEdit}
              onChange={(e) => updateCustom(customItems.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              className={`h-7 flex-1 text-sm ${a.done ? "line-through text-muted-foreground" : ""}`}
            />
            {canEdit && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                onClick={() => updateCustom(customItems.filter((_, j) => j !== i))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
        {canEdit && (
          <div className="flex items-center gap-1.5 pt-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="New achievement…"
              className="h-7 flex-1 text-sm"
            />
            <Button size="sm" variant="outline" className="h-7" onClick={add}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}





// ============================================================
// Contest section (rank + per-rank achievements)
// ============================================================
function ContestSection({
  contestRank, achievements, canEdit, onRankChange, onAchievements,
}: {
  contestRank: string;
  achievements: Achievement[];
  canEdit: boolean;
  onRankChange: (r: string) => void;
  onAchievements: (items: Achievement[]) => void;
}) {
  const nextKey = NEXT_CONTEST_RANK[contestRank];
  const req = nextKey ? CONTEST_RANK_UP[nextKey] : undefined;
  const rankItems: Achievement[] = req
    ? req.items.map((n) => {
        const existing = achievements.find((a) => a.kind === "contest_rank" && a.rankFor === nextKey && a.name === n);
        return { name: n, done: existing?.done ?? false, kind: "contest_rank" as Achievement["kind"], rankFor: nextKey };
      })
    : [];
  const other = achievements.filter((a) => a.kind !== "contest_rank");
  function updateDone(idx: number, done: boolean) {
    const next = rankItems.map((x, j) => (j === idx ? { ...x, done } : x));
    onAchievements([...other, ...next]);
  }

  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="inline-flex items-center gap-1 text-sm font-bold uppercase tracking-wider text-pink-500">
          <Award className="h-3.5 w-3.5" /> Contest
        </h3>
        <span className="text-[11px] uppercase text-muted-foreground">Rank</span>
        <Select
          value={contestRank || "none"}
          onValueChange={(v) => onRankChange(v === "none" ? "" : v)}
          disabled={!canEdit}
        >
          <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CONTEST_RANKS.map((r) => (
              <SelectItem key={r || "none"} value={r || "none"}>{CONTEST_RANK_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {req ? (
        <div className="space-y-1.5 rounded border border-dashed border-border/60 bg-muted/30 p-2">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Para subir para {req.label} Rank
          </p>
          {rankItems.map((a, i) => (
            <div key={`cr-${i}`} className="flex items-center gap-2">
              <Checkbox
                checked={a.done}
                disabled={!canEdit}
                onCheckedChange={() => updateDone(i, !a.done)}
              />
              <span className={`flex-1 text-sm ${a.done ? "line-through text-muted-foreground" : ""}`}>
                {a.name}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Master Coordinator — sem próximo rank.</p>
      )}
    </section>
  );
}
