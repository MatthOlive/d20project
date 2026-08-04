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
import { ImageSourceDialog } from "@/components/ImageSourceDialog";
import { AutosaveStatus } from "@/components/AutosaveStatus";

import { useDebouncedPatch } from "@/lib/use-debounced-patch";
import { toast } from "sonner";
import { Dices, ImagePlus, X as XIcon, Plus, Trash2, Award, ChevronDown, ChevronUp } from "lucide-react";
import {
  HpAndStatusBlock, AttackRollButton, GenericRollButton, painPenaltyFor,
} from "@/components/SheetRolls";
import { SheetPermissionsDialog } from "@/components/SheetPermissionsDialog";

const POKEBALLS = {
  pokeball:  { label: "PokÃ©ball",  pool: 4 },
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
  allowed_editors: string[];
  allowed_viewers: string[];
};

type CustomSkill = { name: string; value: number };
type Badge = { name: string; image_url?: string | null };

type InventoryItem = { name: string; qty: number; desc?: string };
type Achievement = { name: string; done: boolean; kind?: "rank" | "custom" | "contest_rank"; rankFor?: string };

// Requisitos para alcanÃ§ar CADA rank (chave = rank de destino).
// Quando o treinador estÃ¡ em X, mostramos os requisitos da chave NEXT_RANK[X].
const RANK_UP_REQUIREMENTS: Record<string, { label: string; items: string[] }> = {
  beginner: {
    label: "Beginner",
    items: [
      "Successfully understand your PokÃ©mon's gestures",
      "Train a PokÃ©mon",
      "Catch your second PokÃ©mon",
      "Win your first Official Battle against a Trainer",
    ],
  },
  amateur: {
    label: "Amateur",
    items: [
      "Evolve a PokÃ©mon",
      "Win your First Badge",
      "Increase a PokÃ©mon's Loyalty & Happiness",
    ],
  },
  ace: {
    label: "Ace",
    items: [
      "Win 8 Badges",
      "Get a full party of six evolved PokÃ©mon",
      "Defeat your Rival",
    ],
  },
  pro: {
    label: "Pro",
    items: [
      "Get a PokÃ©mon-related job",
      "Clear the Victory Road",
      "Catch a Professional-Rank PokÃ©mon",
    ],
  },
  master: {
    label: "Master",
    items: [
      "Find and study all PokÃ©mon species in your Region",
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
    if (error) throw new Error(error.message);
  }, [trainerId]);
  const { patch, retry: retrySave, saveState, saveError } = useDebouncedPatch<Trainer>(queryKey, commit, 400, {
    storageKey: `d20:pending:trainer:${userId}:${trainerId}`,
  });

  if (!trainer) return <div className="p-4 text-sm text-muted-foreground">Loadingâ€¦</div>;
  const canEdit = trainer.owner_id === userId
    || isNarrator
    || (trainer.allowed_editors ?? []).includes(userId);

  if (!canEdit) {
    return (
      <div className="space-y-4 p-4">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b-2 border-primary bg-primary/10 px-3 py-1.5">
            <span className="truncate text-[12px] font-bold uppercase tracking-wider text-primary">{trainer.name}</span>
          </div>
          <div className="flex flex-col items-center gap-3 p-6">
            {trainer.image_url ? (
              <img src={trainer.image_url} alt={trainer.name} className="h-48 w-48 rounded-lg object-contain" />
            ) : (
              <div className="grid h-48 w-48 place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                Sem imagem
              </div>
            )}
            <div className="text-lg font-bold">{trainer.name}</div>
            <div className="text-xs text-muted-foreground">VocÃª nÃ£o tem permissÃ£o para ver detalhes desta ficha.</div>
          </div>
        </section>
      </div>
    );
  }

  // Trainer attributes have a base value of 1 (per PokÃ©role 2 rules).
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
      {/* ============ BLOCO 1 â€” Identidade ============ */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b-2 border-primary bg-primary/10 px-3 py-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-primary">PokÃ©mon League Â· Trainer Card</span>
          <AutosaveStatus
            state={saveState}
            error={saveError}
            onRetry={() => { void retrySave().catch(() => undefined); }}
          />
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
                <span className="text-xs font-bold text-primary">â‚½</span>
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
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="â€”" /></SelectTrigger>
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
                onClick={() => onRoll(`${charName} Â· Initiative (Dex+Alert)`, initiativePool, painPenalty, { characterKind: "trainer", characterId: trainerId, imageUrl: trainer.image_url })}>
                <Dices className="mr-1 h-3.5 w-3.5" /> Initiative Â· {initiativePool}d6
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
                onClick={() => onRoll(`${charName} Â· Evasion (Dex+Evasion)`, evasionPool, painPenalty)}>
                <Dices className="mr-1 h-3.5 w-3.5" /> Evasion Â· {evasionPool}d6
              </Button>
              <Button size="sm" variant="outline" className="h-7"
                onClick={() => onRoll(`${charName} Â· Clash (Str+Clashï¾ü¶‰žËkºwµç@€¤€è€ 4(€€€€€€€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ ´àÜ´àÉ½Õ¹‘•‰œµµÕÑ•ˆ€¼ø4(€€€€€€€€€€€€€€€€¥ô4(€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰™±•à´ÄÑ•áÐµÍ´ˆùí”¹¹…µ•ôð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€ñ±…‰•°±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ä¸ÔÑ•áÐµáÌˆø4(€€€€€€€€€€€€€€€€€€ñ¡•­‰½à4(€€€€€€€€€€€€€€€€€€€¡•­•õí”¹…ÁÑÕÉ•‘ô4(€€€€€€€€€€€€€€€€€€€½¹¡•­•‘¡…¹”õì ¤€ôø…¹‘¥Ð€˜˜Ñ½±•…ÁÑÕÉ•¡¥¥ô4(€€€€€€€€€€€€€€€€€€€‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€€€€€€…Õ¡Ð4(€€€€€€€€€€€€€€€€ð½±…‰•°ø4(€€€€€€€€€€€€€€€í…¹‘¥Ð€˜˜€ 4(€€€€€€€€€€€€€€€€€€ñ	ÕÑÑ½¸Í¥é”ô‰Í´ˆÙ…É¥…¹Ðô‰¡½ÍÐˆ±…ÍÍ9…µ”ô‰ ´ÜÜ´ÜÀ´Àˆ½¹±¥¬õì ¤€ôøÉ•µ½Ù•¹ÑÉä¡¥¥ôø4(€€€€€€€€€€€€€€€€€€€€ñQÉ…Í È±…ÍÍ9…µ”ô‰ ´Ì¸ÔÜ´Ì¸Ôˆ€¼ø4(€€€€€€€€€€€€€€€€€€ð½	ÕÑÑ½¸ø4(€€€€€€€€€€€€€€€€¥ô4(€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€¤¥ô4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€¤4(€€€€€€¥ô4(4(€€€€€€ñ¥…±½œ½Á•¸õí½Á•¹ô½¹=Á•¹¡…¹”õíÍ•Ñ=Á•¹ôø4(€€€€€€€€ñ¥…±½½¹Ñ•¹Ð±…ÍÍ9…µ”ô‰µ…àµ µlàÁÙ¡tµ…àµÜµ±œ½Ù•É™±½Üµ¡¥‘‘•¸ˆø4(€€€€€€€€€€ñ¥…±½!•…‘•Èøñ¥…±½Q¥Ñ±”ù‘A½¯¥µ½¸Ñ¼A½¯¥‘•àð½¥…±½Q¥Ñ±”øð½¥…±½!•…‘•Èø4(€€€€€€€€€€ñ%¹ÁÕÐÁ±…•¡½±‘•Èô‰M•…É ÍÁ•¥•ÏŠ˜ˆÙ…±Õ”õíÍ•…É¡ô½¹¡…¹”õì¡”¤€ôøÍ•ÑM•…É ¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô€¼ø4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µ…àµ µlÔÕÙ¡t½Ù•É™±½Üµäµ…ÕÑ¼É½Õ¹‘•µµ‰½É‘•È‰½É‘•Èµ‰½É‘•Èˆø4(€€€€€€€€€€€í™¥±Ñ•É•¹µ…À ¡Ì¤€ôøì4(€€€€€€€€€€€€€½¹ÍÐ…‘‘•€ô€„…Á½­•‘•ámÌ¹¥‘tì4(€€€€€€€€€€€€€É•ÑÕÉ¸€ 4(€€€€€€€€€€€€€€€€ñ‰ÕÑÑ½¸4(€€€€€€€€€€€€€€€€€­•äõíÌ¹¥‘ô4(€€€€€€€€€€€€€€€€€ÑåÁ”ô‰‰ÕÑÑ½¸ˆ4(€€€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôø…‘‘MÁ•¥•Ì¡Ì¥ô4(€€€€€€€€€€€€€€€€€‘¥Í…‰±•õí…‘‘•‘ô4(€€€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰™±•àÜµ™Õ±°¥Ñ•µÌµ•¹Ñ•È…À´È‰½É‘•Èµˆ‰½É‘•Èµ‰½É‘•ÈÁà´ÈÁä´Ä¸ÔÑ•áÐµ±•™Ð¡½Ù•Èé‰œµ…•¹Ð‘¥Í…‰±•é½Á…¥Ñä´ÔÀˆ4(€€€€€€€€€€€€€€€€ø4(€€€€€€€€€€€€€€€€€íÌ¹ÍÁÉ¥Ñ•}ÕÉ°€ü€ 4(€€€€€€€€€€€€€€€€€€€€ñ¥µœÍÉŒõíÌ¹ÍÁÉ¥Ñ•}ÕÉ±ô…±ÐõíÌ¹¹…µ•ô±…ÍÍ9…µ”ô‰ ´àÜ´à½‰©•Ðµ½¹Ñ…¥¸ˆ€¼ø4(€€€€€€€€€€€€€€€€€€¤€è€ñ‘¥Ø±…ÍÍ9…µ”ô‰ ´àÜ´àÉ½Õ¹‘•‰œµµÕÑ•ˆ€¼ùô4(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰™±•à´ÄÑ•áÐµÍ´ˆø4(€€€€€€€€€€€€€€€€€€€íÌ¹‘•á}¹Õµ‰•È€ü€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµµÕÑ•µ™½É•É½Õ¹ˆøíMÑÉ¥¹œ¡Ì¹‘•á}¹Õµ‰•È¤¹Á…‘MÑ…ÉÐ Ì°€ˆÀˆ¥ô€ð½ÍÁ…¸ø€è¹Õ±±ô4(€€€€€€€€€€€€€€€€€€€íÌ¹¹…µ•ô4(€€€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø4(€€€€€€€€€€€€€€€€€í…‘‘•€˜˜€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆù‘‘•ð½ÍÁ…¸ùô4(€€€€€€€€€€€€€€€€ð½‰ÕÑÑ½¸ø4(€€€€€€€€€€€€€€¤ì4(€€€€€€€€€€€ô¥ô4(€€€€€€€€€€€í™¥±Ñ•É•¹±•¹Ñ €ôôô€À€˜˜€ñÀ±…ÍÍ9…µ”ô‰À´ÐÑ•áÐµ•¹Ñ•ÈÑ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆù9¼ÍÁ•¥•Ì™½Õ¹¸ð½Àùô4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€ð½¥…±½½¹Ñ•¹Ðø4(€€€€€€ð½¥…±½œø4(€€€€ð½Í•Ñ¥½¸ø4(€€¤ì4)ô4(4)™Õ¹Ñ¥½¸%Ñ•µ1¥ÍÑM•Ñ¥½¸¡ì4(€Ñ¥Ñ±”°¥Ñ•µÌ°…¹‘¥Ð°½¹¡…¹”°Á±…•¡½±‘•È°•µ‰•‘‘•°4)ôèì4(€Ñ¥Ñ±”èÍÑÉ¥¹œì4(€¥Ñ•µÌè%¹Ù•¹Ñ½Éå%Ñ•µmtì4(€…¹‘¥Ðè‰½½±•…¸ì4(€½¹¡…¹”è€¡¥Ñ•µÌè%¹Ù•¹Ñ½Éå%Ñ•µmt¤€ôøÙ½¥ì4(€Á±…•¡½±‘•ÈüèÍÑÉ¥¹œì4(€•µ‰•‘‘•üè‰½½±•…¸ì4)ô¤ì4(€½¹ÍÐm¹…µ”°Í•Ñ9…µ•t€ôÕÍ•MÑ…Ñ” ˆˆ¤ì4(€½¹ÍÐmÅÑä°Í•ÑEÑåt€ôÕÍ•MÑ…Ñ” Ä¤ì4(€™Õ¹Ñ¥½¸…‘ ¤ì4(€€€½¹ÍÐ¸€ô¹…µ”¹ÑÉ¥´ ¤ì4(€€€¥˜€ …¸¤É•ÑÕÉ¸ì4(€€€½¹¡…¹”¡l¸¸¹¥Ñ•µÌ°ì¹…µ”è¸°ÅÑäè5…Ñ ¹µ…à Ä°ÅÑä¤õt¤ì4(€€€Í•Ñ9…µ” ˆˆ¤ìÍ•ÑEÑä Ä¤ì4(€ô4(€™Õ¹Ñ¥½¸ÕÁ‘…Ñ”¡¥‘àè¹Õµ‰•È°Á…Ñ èA…ÉÑ¥…°ñ%¹Ù•¹Ñ½Éå%Ñ•´ø¤ì4(€€€½¹¡…¹”¡¥Ñ•µÌ¹µ…À ¡¥Ð°¤¤€ôø€¡¤€ôôô¥‘à€üì€¸¸¹¥Ð°€¸¸¹Á…Ñ ô€è¥Ð¤¤¤ì4(€ô4(€™Õ¹Ñ¥½¸É•µ½Ù”¡¥‘àè¹Õµ‰•È¤ì4(€€€½¹¡…¹”¡¥Ñ•µÌ¹™¥±Ñ•È ¡|°¤¤€ôø¤€„ôô¥‘à¤¤ì4(€ô4(€É•ÑÕÉ¸€ 4(€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”õí•µ‰•‘‘•€ü€ˆˆ€è€ˆ‰ôø4(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µˆ´È™±•à¥Ñ•µÌµ•¹Ñ•È©ÕÍÑ¥™äµ‰•ÑÝ••¸ˆø4(€€€€€€€€ñ Ì±…ÍÍ9…µ”ô‰Ñ•áÐµÍ´™½¹Ðµ‰½±ˆùíÑ¥Ñ±•ôð½ Ìø4(€€€€€€ð½‘¥Øø4(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ä¸ÔÉ½Õ¹‘•µµ‰½É‘•È‰½É‘•Èµ‰½É‘•È‰œµ…ÉÀ´Èˆø4(€€€€€€€í¥Ñ•µÌ¹±•¹Ñ €ôôô€À€˜˜€ 4(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Áà´ÄÑ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆù9¼¥Ñ•µÌ¸ð½Àø4(€€€€€€€€¥ô4(€€€€€€€í¥Ñ•µÌ¹µ…À ¡¥Ð°¤¤€ôø€ 4(€€€€€€€€€€ñ‘¥Ø­•äõí¥ô±…ÍÍ9…µ”ô‰ÍÁ…”µä´ÄÉ½Õ¹‘•µµ‰½É‘•È‰½É‘•Èµ‰½É‘•È¼ØÀ‰œµ‰…­É½Õ¹¼ÐÀÀ´Ä¸Ôˆø4(€€€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ä¸Ôˆø4(€€€€€€€€€€€€€€ñ%¹ÁÕÐ4(€€€€€€€€€€€€€€€Ù…±Õ”õí¥Ð¹¹…µ•ô4(€€€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÕÁ‘…Ñ”¡¤°ì¹…µ”è”¹Ñ…É•Ð¹Ù…±Õ”ô¥ô4(€€€€€€€€€€€€€€€‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´Ü™±•à´ÄÑ•áÐµÍ´ˆ4(€€€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€€€ñ%¹ÁÕÐ4(€€€€€€€€€€€€€€€ÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸õìÁô4(€€€€€€€€€€€€€€€Ù…±Õ”õí¥Ð¹ÅÑåô4(€€€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÕÁ‘…Ñ”¡¤°ìÅÑäèÁ…ÉÍ•%¹Ð¡”¹Ñ…É•Ð¹Ù…±Õ”¤ñð€Àô¥ô4(€€€€€€€€€€€€€€€‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´ÜÜ´ÄÐÑ•áÐµ•¹Ñ•ÈÑ•áÐµÍ´ˆ4(€€€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€€í…¹‘¥Ð€˜˜€ 4(€€€€€€€€€€€€€€€€ñ	ÕÑÑ½¸Í¥é”ô‰Í´ˆÙ…É¥…¹Ðô‰¡½ÍÐˆ±…ÍÍ9…µ”ô‰ ´ÜÜ´ÜÀ´Àˆ½¹±¥¬õì ¤€ôøÉ•µ½Ù”¡¤¥ôø4(€€€€€€€€€€€€€€€€€€ñQÉ…Í È±…ÍÍ9…µ”ô‰ ´Ì¸ÔÜ´Ì¸Ôˆ€¼ø4(€€€€€€€€€€€€€€€€ð½	ÕÑÑ½¸ø4(€€€€€€€€€€€€€€¥ô4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€ñQ•áÑ…É•„4(€€€€€€€€€€€€€Ù…±Õ”õí¥Ð¹‘•ÍŒ€üü€ˆ‰ô4(€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÕÁ‘…Ñ”¡¤°ì‘•ÍŒè”¹Ñ…É•Ð¹Ù…±Õ”ô¥ô4(€€€€€€€€€€€€€‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€É½ÝÌõìÉô4(€€€€€€€€€€€€€Á±…•¡½±‘•Èô‰•ÍÉ§Ÿ¼‘¼¥Ñ•·Š˜ˆ4(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰Ñ•áÐµáÌˆ4(€€€€€€€€€€€€¼ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€¤¥ô4(€€€€€€€í…¹‘¥Ð€˜˜€ 4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ä¸ÔÁÐ´Äˆø4(€€€€€€€€€€€€ñ%¹ÁÕÐ4(€€€€€€€€€€€€€Ù…±Õ”õí¹…µ•ô4(€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÍ•Ñ9…µ”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô4(€€€€€€€€€€€€€½¹-•å½Ý¸õì¡”¤€ôø”¹­•ä€ôôô€‰¹Ñ•Èˆ€˜˜…‘ ¥ô4(€€€€€€€€€€€€€Á±…•¡½±‘•ÈõíÁ±…•¡½±‘•È€üü€‰%Ñ•·Š˜‰ô4(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´Ü™±•à´ÄÑ•áÐµÍ´ˆ4(€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€ñ%¹ÁÕÐ4(€€€€€€€€€€€€€ÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸õìÅôÙ…±Õ”õíÅÑåô4(€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÍ•ÑEÑä¡Á…ÉÍ•%¹Ð¡”¹Ñ…É•Ð¹Ù…±Õ”¤ñð€Ä¥ô4(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´ÜÜ´ÄÐÑ•áÐµ•¹Ñ•ÈÑ•áÐµÍ´ˆ4(€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€ñ	ÕÑÑ½¸Í¥é”ô‰Í´ˆÙ…É¥…¹Ðô‰½ÕÑ±¥¹”ˆ±…ÍÍ9…µ”ô‰ ´Üˆ½¹±¥¬õí…‘‘ôø4(€€€€€€€€€€€€€€ñA±ÕÌ±…ÍÍ9…µ”ô‰ ´Ì¸ÔÜ´Ì¸Ôˆ€¼ø4(€€€€€€€€€€€€ð½	ÕÑÑ½¸ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€¥ô4(€€€€€€ð½‘¥Øø4(€€€€ð½Í•Ñ¥½¸ø4(€€¤ì4)ô4(4)™Õ¹Ñ¥½¸A½Ñ¥½¹Í	±½¬¡ì4(€Á½Ñ¥½¹Ì°…¹‘¥Ð°½¹¡…¹”°4)ôèì4(€Á½Ñ¥½¹ÌèI•½ÉñÍÑÉ¥¹œ°ì½Õ¹Ðè¹Õµ‰•ÈìÕÍ•è¹Õµ‰•Èìµ…àè¹Õµ‰•Èôøì4(€…¹‘¥Ðè‰½½±•…¸ì4(€½¹¡…¹”è€¡ÀèI•½ÉñÍÑÉ¥¹œ°ì½Õ¹Ðè¹Õµ‰•ÈìÕÍ•è¹Õµ‰•Èìµ…àè¹Õµ‰•Èôø¤€ôøÙ½¥ì4)ô¤ì4(€™Õ¹Ñ¥½¸ÕÁ‘…Ñ”¡­•äèÍÑÉ¥¹œ°™¥•±è€‰½Õ¹Ðˆð€‰ÕÍ•ˆð€‰µ…àˆ°Ù…°è¹Õµ‰•È¤ì4(€€€½¹ÍÐÑ¥•È€ôA=Q%=9}Q%IL¹™¥¹ ¡Ð¤€ôøÐ¹­•ä€ôôô­•ä¤ì4(€€€½¹ÍÐÕÈ€ôÁ½Ñ¥½¹Ím­•åt€üüì½Õ¹Ðè€À°ÕÍ•è€À°µ…àèÑ¥•Èü¹‘•™…Õ±Ñ5…à€üü€Àôì4(€€€½¹¡…¹”¡ì€¸¸¹Á½Ñ¥½¹Ì°m­•åtèì€¸¸¹ÕÈ°m™¥•±‘tè5…Ñ ¹µ…à À°Ù…°¤ôô¤ì4(€ô4(€É•ÑÕÉ¸€ 4(€€€€ñÍ•Ñ¥½¸ø4(€€€€€€ñ Ì±…ÍÍ9…µ”ô‰µˆ´ÈÑ•áÐµÍ´™½¹Ðµ‰½±ˆùA½Ñ¥½¹Ìð½ Ìø4(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´ÄÉ½Õ¹‘•µµ‰½É‘•È‰½É‘•Èµ‰½É‘•È‰œµ…ÉÀ´Èˆø4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰É¥É¥µ½±ÌµlÅ™É}É•Á•…Ð Ì±µ¥¹µ…à À°Ì¸ÕÉ•´¤¥t¥Ñ•µÌµ•¹Ñ•È…À´Ä¸ÔÁà´ÄÑ•áÐµlÄÁÁát™½¹ÐµÍ•µ¥‰½±ÕÁÁ•É…Í”Ñ•áÐµµÕÑ•µ™½É•É½Õ¹ˆø4(€€€€€€€€€€ñÍÁ…¸øð½ÍÁ…¸øñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµ•¹Ñ•Èˆù½Õ¹Ðð½ÍÁ…¸øñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµ•¹Ñ•ÈˆùUÍ•ð½ÍÁ…¸øñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµ•¹Ñ•Èˆù5…àð½ÍÁ…¸ø4(€€€€€€€€ð½‘¥Øø4(€€€€€€€íA=Q%=9}Q%IL¹µ…À ¡Ñ¥•È¤€ôøì4(€€€€€€€€€½¹ÍÐØ€ôÁ½Ñ¥½¹ÍmÑ¥•È¹­•åt€üüì½Õ¹Ðè€À°ÕÍ•è€À°µ…àèÑ¥•È¹‘•™…Õ±Ñ5…àôì4(€€€€€€€€€É•ÑÕÉ¸€ 4(€€€€€€€€€€€€ñ‘¥Ø­•äõíÑ¥•È¹­•åô±…ÍÍ9…µ”ô‰É¥É¥µ½±ÌµlÅ™É}É•Á•…Ð Ì±µ¥¹µ…à À°Ì¸ÕÉ•´¤¥t¥Ñ•µÌµ•¹Ñ•È…À´Ä¸Ôˆø4(€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµáÌ™½¹Ðµµ•‘¥Õ´ˆùíÑ¥•È¹±…‰•±ôð½ÍÁ…¸ø4(€€€€€€€€€€€€€€ñ%¹ÁÕÐÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸õìÁôÙ…±Õ”õíØ¹½Õ¹Ñô‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÕÁ‘…Ñ”¡Ñ¥•È¹­•ä°€‰½Õ¹Ðˆ°Á…ÉÍ•%¹Ð¡”¹Ñ…É•Ð¹Ù…±Õ”¤ñð€À¥ô4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´ÜÑ•áÐµ•¹Ñ•ÈÑ•áÐµáÌˆ€¼ø4(€€€€€€€€€€€€€€ñ%¹ÁÕÐÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸õìÁôÙ…±Õ”õíØ¹ÕÍ•‘ô‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÕÁ‘…Ñ”¡Ñ¥•È¹­•ä°€‰ÕÍ•ˆ°Á…ÉÍ•%¹Ð¡”¹Ñ…É•Ð¹Ù…±Õ”¤ñð€À¥ô4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´ÜÑ•áÐµ•¹Ñ•ÈÑ•áÐµáÌˆ€¼ø4(€€€€€€€€€€€€€€ñ%¹ÁÕÐÑåÁ”ô‰¹Õµ‰•Èˆµ¥¸õìÁôÙ…±Õ”õíØ¹µ…áô‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÕÁ‘…Ñ”¡Ñ¥•È¹­•ä°€‰µ…àˆ°Á…ÉÍ•%¹Ð¡”¹Ñ…É•Ð¹Ù…±Õ”¤ñð€À¥ô4(€€€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´ÜÑ•áÐµ•¹Ñ•ÈÑ•áÐµáÌˆ€¼ø4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€¤ì4(€€€€€€€ô¥ô4(€€€€€€ð½‘¥Øø4(€€€€ð½Í•Ñ¥½¸ø4(€€¤ì4)ô4(4)™Õ¹Ñ¥½¸¡¥•Ù•µ•¹ÑÍM•Ñ¥½¸¡ì4(€¥Ñ•µÌ°É…¹¬°…¹‘¥Ð°½¹¡…¹”°4)ôèì4(€¥Ñ•µÌè¡¥•Ù•µ•¹Ñmtì4(€É…¹¬èÍÑÉ¥¹œì4(€…¹‘¥Ðè‰½½±•…¸ì4(€½¹¡…¹”è€¡¥Ñ•µÌè¡¥•Ù•µ•¹Ñmt¤€ôøÙ½¥ì4)ô¤ì4(€½¹ÍÐm¹…µ”°Í•Ñ9…µ•t€ôÕÍ•MÑ…Ñ” ˆˆ¤ì4(€½¹ÍÐ¹•áÑI…¹­-•ä€ô9aQ}I9-mÉ…¹­tì4(€½¹ÍÐÉ…¹­I•Ä€ô¹•áÑI…¹­-•ä€üI9-}UA}IEU%I59QMm¹•áÑI…¹­-•åt€èÕ¹‘•™¥¹•ì4(4(€€¼¼	Õ¥±É…¹¬µÕÀ…¡¥•Ù•µ•¹ÑÌ™½ÈÑ¡”9aPÉ…¹¬°ÁÉ•Í•ÉÙ¥¹œ‘½¹”ÍÑ…Ñ”™É½´•á¥ÍÑ¥¹œ¥Ñ•µÌ4(€½¹ÍÐÉ…¹­%Ñ•µÌè¡¥•Ù•µ•¹Ñmt€ôÉ…¹­I•Ä4(€€€€üÉ…¹­I•Ä¹¥Ñ•µÌ¹µ…À ¡¸¤€ôøì4(€€€€€€€½¹ÍÐ•á¥ÍÑ¥¹œ€ô¥Ñ•µÌ¹™¥¹ ¡„¤€ôø„¹­¥¹€ôôô€‰É…¹¬ˆ€˜˜„¹É…¹­½È€ôôô¹•áÑI…¹­-•ä€˜˜„¹¹…µ”€ôôô¸¤ì4(€€€€€€€É•ÑÕÉ¸ì¹…µ”è¸°‘½¹”è•á¥ÍÑ¥¹œü¹‘½¹”€üü™…±Í”°­¥¹è€‰É…¹¬ˆ°É…¹­½Èè¹•áÑI…¹­-•äôì4(€€€€€ô¤4(€€€€èmtì4(€½¹ÍÐÕÍÑ½µ%Ñ•µÌ€ô¥Ñ•µÌ¹™¥±Ñ•È ¡„¤€ôø„¹­¥¹€„ôô€‰É…¹¬ˆ€˜˜„¹­¥¹€„ôô€‰½¹Ñ•ÍÑ}É…¹¬ˆ¤ì4(€½¹ÍÐ½¹Ñ•ÍÑ%Ñ•µÌ€ô¥Ñ•µÌ¹™¥±Ñ•È ¡„¤€ôø„¹­¥¹€ôôô€‰½¹Ñ•ÍÑ}É…¹¬ˆ¤ì4(4(€™Õ¹Ñ¥½¸ÕÁ‘…Ñ•I…¹­½¹”¡¥‘àè¹Õµ‰•È°‘½¹”è‰½½±•…¸¤ì4(€€€½¹ÍÐ¹•ÝI…¹¬€ôÉ…¹­%Ñ•µÌ¹µ…À ¡à°¨¤€ôø€¡¨€ôôô¥‘à€üì€¸¸¹à°‘½¹”ô€èà¤¤ì4(€€€½¹¡…¹”¡l¸¸¹¹•ÝI…¹¬°€¸¸¹½¹Ñ•ÍÑ%Ñ•µÌ°€¸¸¹ÕÍÑ½µ%Ñ•µÍt¤ì4(€ô4(€™Õ¹Ñ¥½¸ÕÁ‘…Ñ•ÕÍÑ½´¡¹•áÐè¡¥•Ù•µ•¹Ñmt¤ì4(€€€½¹¡…¹”¡l¸¸¹É…¹­%Ñ•µÌ°€¸¸¹½¹Ñ•ÍÑ%Ñ•µÌ°€¸¸¹¹•áÐ¹µ…À ¡à¤€ôø€¡ì€¸¸¹à°­¥¹è€‰ÕÍÑ½´ˆ…Ì½¹ÍÐô¤¥t¤ì4(€ô4(€™Õ¹Ñ¥½¸…‘ ¤ì4(€€€½¹ÍÐ¸€ô¹…µ”¹ÑÉ¥´ ¤ì¥˜€ …¸¤É•ÑÕÉ¸ì4(€€€ÕÁ‘…Ñ•ÕÍÑ½´¡l¸¸¹ÕÍÑ½µ%Ñ•µÌ°ì¹…µ”è¸°‘½¹”è™…±Í”õt¤ì4(€€€Í•Ñ9…µ” ˆˆ¤ì4(€ô4(4(€É•ÑÕÉ¸€ 4(€€€€ñÍ•Ñ¥½¸ø4(€€€€€€ñ Ì±…ÍÍ9…µ”ô‰µˆ´ÈÑ•áÐµÍ´™½¹Ðµ‰½±ˆù¡¥•Ù•µ•¹ÑÌð½ Ìø4(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ä¸ÔÉ½Õ¹‘•µµ‰½É‘•È‰½É‘•Èµ‰½É‘•È‰œµ…ÉÀ´Èˆø4(€€€€€€€íÉ…¹­I•Ä€˜˜€ 4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ä¸ÔÉ½Õ¹‘•‰½É‘•È‰½É‘•Èµ‘…Í¡•‰½É‘•Èµ‰½É‘•È¼ØÀ‰œµµÕÑ•¼ÌÀÀ´Èˆø4(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Áà´ÄÑ•áÐµlÄÁÁát™½¹ÐµÍ•µ¥‰½±ÕÁÁ•É…Í”ÑÉ…­¥¹œµÝ¥‘”Ñ•áÐµµÕÑ•µ™½É•É½Õ¹ˆø4(€€€€€€€€€€€€€A…É„ÍÕ‰¥ÈÁ…É„íÉ…¹­I•Ä¹±…‰•±ôI…¹¬4(€€€€€€€€€€€€ð½Àø4(€€€€€€€€€€€íÉ…¹­%Ñ•µÌ¹µ…À ¡„°¤¤€ôø€ 4(€€€€€€€€€€€€€€ñ‘¥Ø­•äõíÈ´‘í¥õô±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø4(€€€€€€€€€€€€€€€€ñ¡•­‰½à4(€€€€€€€€€€€€€€€€€¡•­•õí„¹‘½¹•ô4(€€€€€€€€€€€€€€€€€‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€€€€€½¹¡•­•‘¡…¹”õì ¤€ôøÕÁ‘…Ñ•I…¹­½¹”¡¤°€…„¹‘½¹”¥ô4(€€€€€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”õí™±•à´ÄÑ•áÐµÍ´€‘í„¹‘½¹”€ü€‰±¥¹”µÑ¡É½Õ Ñ•áÐµµÕÑ•µ™½É•É½Õ¹ˆ€è€ˆ‰õôø4(€€€€€€€€€€€€€€€€€í„¹¹…µ•ô4(€€€€€€€€€€€€€€€€ð½ÍÁ…¸ø4(€€€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€€€¤¥ô4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€¥ô4(4(4(€€€€€€€íÕÍÑ½µ%Ñ•µÌ¹±•¹Ñ €ôôô€À€˜˜€…É…¹­I•Ä€˜˜€ 4(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Áà´ÄÑ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆù9¼…¡¥•Ù•µ•¹ÑÌå•Ð¸ð½Àø4(€€€€€€€€¥ô4(€€€€€€€íÕÍÑ½µ%Ñ•µÌ¹µ…À ¡„°¤¤€ôø€ 4(€€€€€€€€€€ñ‘¥Ø­•äõíŒ´‘í¥õô±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø4(€€€€€€€€€€€€ñ¡•­‰½à4(€€€€€€€€€€€€€¡•­•õí„¹‘½¹•ô4(€€€€€€€€€€€€€‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€½¹¡•­•‘¡…¹”õì ¤€ôøÕÁ‘…Ñ•ÕÍÑ½´¡ÕÍÑ½µ%Ñ•µÌ¹µ…À ¡à°¨¤€ôø¨€ôôô¤€üì€¸¸¹à°‘½¹”è€…à¹‘½¹”ô€èà¤¥ô4(€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€ñ%¹ÁÕÐ4(€€€€€€€€€€€€€Ù…±Õ”õí„¹¹…µ•ô4(€€€€€€€€€€€€€‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÕÁ‘…Ñ•ÕÍÑ½´¡ÕÍÑ½µ%Ñ•µÌ¹µ…À ¡à°¨¤€ôø¨€ôôô¤€üì€¸¸¹à°¹…µ”è”¹Ñ…É•Ð¹Ù…±Õ”ô€èà¤¥ô4(€€€€€€€€€€€€€±…ÍÍ9…µ”õí ´Ü™±•à´ÄÑ•áÐµÍ´€‘í„¹‘½¹”€ü€‰±¥¹”µÑ¡É½Õ Ñ•áÐµµÕÑ•µ™½É•É½Õ¹ˆ€è€ˆ‰õô4(€€€€€€€€€€€€¼ø4(€€€€€€€€€€€í…¹‘¥Ð€˜˜€ 4(€€€€€€€€€€€€€€ñ	ÕÑÑ½¸Í¥é”ô‰Í´ˆÙ…É¥…¹Ðô‰¡½ÍÐˆ±…ÍÍ9…µ”ô‰ ´ÜÜ´ÜÀ´Àˆ4(€€€€€€€€€€€€€€€½¹±¥¬õì ¤€ôøÕÁ‘…Ñ•ÕÍÑ½´¡ÕÍÑ½µ%Ñ•µÌ¹™¥±Ñ•È ¡|°¨¤€ôø¨€„ôô¤¤¥ôø4(€€€€€€€€€€€€€€€€ñQÉ…Í È±…ÍÍ9…µ”ô‰ ´Ì¸ÔÜ´Ì¸Ôˆ€¼ø4(€€€€€€€€€€€€€€ð½	ÕÑÑ½¸ø4(€€€€€€€€€€€€¥ô4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€¤¥ô4(€€€€€€€í…¹‘¥Ð€˜˜€ 4(€€€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ä¸ÔÁÐ´Äˆø4(€€€€€€€€€€€€ñ%¹ÁÕÐ4(€€€€€€€€€€€€€Ù…±Õ”õí¹…µ•ô4(€€€€€€€€€€€€€½¹¡…¹”õì¡”¤€ôøÍ•Ñ9…µ”¡”¹Ñ…É•Ð¹Ù…±Õ”¥ô4(€€€€€€€€€€€€€½¹-•å½Ý¸õì¡”¤€ôø”¹­•ä€ôôô€‰¹Ñ•Èˆ€˜˜…‘ ¥ô4(€€€€€€€€€€€€€Á±…•¡½±‘•Èô‰9•Ü…¡¥•Ù•µ•¹ÓŠ˜ˆ4(€€€€€€€€€€€€€±…ÍÍ9…µ”ô‰ ´Ü™±•à´ÄÑ•áÐµÍ´ˆ4(€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€ñ	ÕÑÑ½¸Í¥é”ô‰Í´ˆÙ…É¥…¹Ðô‰½ÕÑ±¥¹”ˆ±…ÍÍ9…µ”ô‰ ´Üˆ½¹±¥¬õí…‘‘ôø4(€€€€€€€€€€€€€€ñA±ÕÌ±…ÍÍ9…µ”ô‰µÈ´Ä ´Ì¸ÔÜ´Ì¸Ôˆ€¼ø‘4(€€€€€€€€€€€€ð½	ÕÑÑ½¸ø4(€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€¥ô4(€€€€€€ð½‘¥Øø4(€€€€ð½Í•Ñ¥½¸ø4(€€¤ì4)ô4(4(4(4(4(4(¼¼€ôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôô4(¼¼½¹Ñ•ÍÐÍ•Ñ¥½¸€¡É…¹¬€¬Á•ÈµÉ…¹¬…¡¥•Ù•µ•¹ÑÌ¤4(¼¼€ôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôôô4)™Õ¹Ñ¥½¸½¹Ñ•ÍÑM•Ñ¥½¸¡ì4(€½¹Ñ•ÍÑI…¹¬°…¡¥•Ù•µ•¹ÑÌ°…¹‘¥Ð°½¹I…¹­¡…¹”°½¹¡¥•Ù•µ•¹ÑÌ°4)ôèì4(€½¹Ñ•ÍÑI…¹¬èÍÑÉ¥¹œì4(€…¡¥•Ù•µ•¹ÑÌè¡¥•Ù•µ•¹Ñmtì4(€…¹‘¥Ðè‰½½±•…¸ì4(€½¹I…¹­¡…¹”è€¡ÈèÍÑÉ¥¹œ¤€ôøÙ½¥ì4(€½¹¡¥•Ù•µ•¹ÑÌè€¡¥Ñ•µÌè¡¥•Ù•µ•¹Ñmt¤€ôøÙ½¥ì4)ô¤ì4(€½¹ÍÐ¹•áÑ-•ä€ô9aQ}=9QMQ}I9-m½¹Ñ•ÍÑI…¹­tì4(€½¹ÍÐÉ•Ä€ô¹•áÑ-•ä€ü=9QMQ}I9-}UAm¹•áÑ-•åt€èÕ¹‘•™¥¹•ì4(€½¹ÍÐÉ…¹­%Ñ•µÌè¡¥•Ù•µ•¹Ñmt€ôÉ•Ä4(€€€€üÉ•Ä¹¥Ñ•µÌ¹µ…À ¡¸¤€ôøì4(€€€€€€€½¹ÍÐ•á¥ÍÑ¥¹œ€ô…¡¥•Ù•µ•¹ÑÌ¹™¥¹ ¡„¤€ôø„¹­¥¹€ôôô€‰½¹Ñ•ÍÑ}É…¹¬ˆ€˜˜„¹É…¹­½È€ôôô¹•áÑ-•ä€˜˜„¹¹…µ”€ôôô¸¤ì4(€€€€€€€É•ÑÕÉ¸ì¹…µ”è¸°‘½¹”è•á¥ÍÑ¥¹œü¹‘½¹”€üü™…±Í”°­¥¹è€‰½¹Ñ•ÍÑ}É…¹¬ˆ…Ì¡¥•Ù•µ•¹Ñl‰­¥¹‰t°É…¹­½Èè¹•áÑ-•äôì4(€€€€€ô¤4(€€€€èmtì4(€½¹ÍÐ½Ñ¡•È€ô…¡¥•Ù•µ•¹ÑÌ¹™¥±Ñ•È ¡„¤€ôø„¹­¥¹€„ôô€‰½¹Ñ•ÍÑ}É…¹¬ˆ¤ì4(€™Õ¹Ñ¥½¸ÕÁ‘…Ñ•½¹”¡¥‘àè¹Õµ‰•È°‘½¹”è‰½½±•…¸¤ì4(€€€½¹ÍÐ¹•áÐ€ôÉ…¹­%Ñ•µÌ¹µ…À ¡à°¨¤€ôø€¡¨€ôôô¥‘à€üì€¸¸¹à°‘½¹”ô€èà¤¤ì4(€€€½¹¡¥•Ù•µ•¹ÑÌ¡l¸¸¹½Ñ¡•È°€¸¸¹¹•áÑt¤ì4(€ô4(4(€É•ÑÕÉ¸€ 4(€€€€ñÍ•Ñ¥½¸±…ÍÍ9…µ”ô‰É½Õ¹‘•µ±œ‰½É‘•È‰½É‘•Èµ‰½É‘•È‰œµ…ÉÀ´Ìˆø4(€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µˆ´È™±•à™±•àµÝÉ…À¥Ñ•µÌµ•¹Ñ•È…À´Èˆø4(€€€€€€€€ñ Ì±…ÍÍ9…µ”ô‰¥¹±¥¹”µ™±•à¥Ñ•µÌµ•¹Ñ•È…À´ÄÑ•áÐµÍ´™½¹Ðµ‰½±ÕÁÁ•É…Í”ÑÉ…­¥¹œµÝ¥‘•ÈÑ•áÐµÁ¥¹¬´ÔÀÀˆø4(€€€€€€€€€€ñÝ…É±…ÍÍ9…µ”ô‰ ´Ì¸ÔÜ´Ì¸Ôˆ€¼ø½¹Ñ•ÍÐ4(€€€€€€€€ð½ Ìø4(€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áÐµlÄÅÁátÕÁÁ•É…Í”Ñ•áÐµµÕÑ•µ™½É•É½Õ¹ˆùI…¹¬ð½ÍÁ…¸ø4(€€€€€€€€ñM•±•Ð4(€€€€€€€€€Ù…±Õ”õí½¹Ñ•ÍÑI…¹¬ñð€‰¹½¹”‰ô4(€€€€€€€€€½¹Y…±Õ•¡…¹”õì¡Ø¤€ôø½¹I…¹­¡…¹”¡Ø€ôôô€‰¹½¹”ˆ€ü€ˆˆ€èØ¥ô4(€€€€€€€€€‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€ø4(€€€€€€€€€€ñM•±•ÑQÉ¥•È±…ÍÍ9…µ”ô‰ ´ÜÜ´ÐÐÑ•áÐµáÌˆøñM•±•ÑY…±Õ”€¼øð½M•±•ÑQÉ¥•Èø4(€€€€€€€€€€ñM•±•Ñ½¹Ñ•¹Ðø4(€€€€€€€€€€€í=9QMQ}I9-L¹µ…À ¡È¤€ôø€ 4(€€€€€€€€€€€€€€ñM•±•Ñ%Ñ•´­•äõíÈñð€‰¹½¹”‰ôÙ…±Õ”õíÈñð€‰¹½¹”‰ôùí=9QMQ}I9-}1	1MmÉuôð½M•±•Ñ%Ñ•´ø4(€€€€€€€€€€€€¤¥ô4(€€€€€€€€€€ð½M•±•Ñ½¹Ñ•¹Ðø4(€€€€€€€€ð½M•±•Ðø4(€€€€€€ð½‘¥Øø4(€€€€€íÉ•Ä€ü€ 4(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Ä¸ÔÉ½Õ¹‘•‰½É‘•È‰½É‘•Èµ‘…Í¡•‰½É‘•Èµ‰½É‘•È¼ØÀ‰œµµÕÑ•¼ÌÀÀ´Èˆø4(€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Áà´ÄÑ•áÐµlÄÁÁát™½¹ÐµÍ•µ¥‰½±ÕÁÁ•É…Í”ÑÉ…­¥¹œµÝ¥‘”Ñ•áÐµµÕÑ•µ™½É•É½Õ¹ˆø4(€€€€€€€€€€€A…É„ÍÕ‰¥ÈÁ…É„íÉ•Ä¹±…‰•±ôI…¹¬4(€€€€€€€€€€ð½Àø4(€€€€€€€€€íÉ…¹­%Ñ•µÌ¹µ…À ¡„°¤¤€ôø€ 4(€€€€€€€€€€€€ñ‘¥Ø­•äõíÈ´‘í¥õô±…ÍÍ9…µ”ô‰™±•à¥Ñ•µÌµ•¹Ñ•È…À´Èˆø4(€€€€€€€€€€€€€€ñ¡•­‰½à4(€€€€€€€€€€€€€€€¡•­•õí„¹‘½¹•ô4(€€€€€€€€€€€€€€€‘¥Í…‰±•õì……¹‘¥Ñô4(€€€€€€€€€€€€€€€½¹¡•­•‘¡…¹”õì ¤€ôøÕÁ‘…Ñ•½¹”¡¤°€…„¹‘½¹”¥ô4(€€€€€€€€€€€€€€¼ø4(€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”õí™±•à´ÄÑ•áÐµÍ´€‘í„¹‘½¹”€ü€‰±¥¹”µÑ¡É½Õ Ñ•áÐµµÕÑ•µ™½É•É½Õ¹ˆ€è€ˆ‰õôø4(€€€€€€€€€€€€€€€í„¹¹…µ•ô4(€€€€€€€€€€€€€€ð½ÍÁ…¸ø4(€€€€€€€€€€€€ð½‘¥Øø4(€€€€€€€€€€¤¥ô4(€€€€€€€€ð½‘¥Øø4(€€€€€€¤€è€ 4(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áÐµáÌÑ•áÐµµÕÑ•µ™½É•É½Õ¹ˆù5…ÍÑ•È½½É‘¥¹…Ñ½ÈƒŠPÍ•´ÁËÍá¥µ¼É…¹¬¸ð½Àø4(€€€€€€¥ô4(€€€€ð½Í•Ñ¥½¸ø4(€€¤ì4)ô4(