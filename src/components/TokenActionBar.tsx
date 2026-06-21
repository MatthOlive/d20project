import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Swords, Zap, Sparkles, Dices, X, Heart, Activity } from "lucide-react";
import { GenericRollButton, painPenaltyFor, STATUS_CONDITIONS } from "@/components/SheetRolls";
import { POKEMON_ATTRS, ATTRS, SOCIAL_ATTRS, TRAINER_SKILLS, SKILLS, RANK_BONUS } from "@/lib/pokerole";
import { MoveCard } from "@/components/MoveCard";
import { MoveRollDialog, computeMoveStats, type MoveData } from "@/components/MoveRollDialog";

type Props = {
  kind: "trainer" | "pokemon";
  id: string;
  label: string;
  gameId: string;
  userId: string;
  onRoll: (label: string, n: number, penalty?: number, meta?: { characterKind: "trainer" | "pokemon"; characterId: string; imageUrl?: string | null }) => void;
  onClose: () => void;
  onOpenSheet: () => void;
  extra?: React.ReactNode;
};

export function TokenActionBar(p: Props) {
  if (p.kind === "trainer") return <TrainerBar {...p} />;
  return <PokemonBar {...p} />;
}

function TrainerBar({ id, label, onRoll, onClose, onOpenSheet, extra }: Props) {
  const { data: t } = useQuery({
    queryKey: ["token-trainer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .select("attrs, social_attrs, skills, rank, confidence, current_hp, status_conditions, image_url")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as {
        attrs: Record<string, number>;
        social_attrs: Record<string, number>;
        skills: Record<string, number>;
        rank: keyof typeof RANK_BONUS;
        confidence: number;
        current_hp: number | null;
        status_conditions: string[];
        image_url: string | null;
      };
    },
  });
  if (!t) return <Shell onClose={onClose} title={label} loading />;

  const dex = t.attrs?.dexterity ?? 1;
  const str = t.attrs?.strength ?? 1;
  const alert = t.skills?.Alert ?? 0;
  const evasion = t.skills?.Evasion ?? 0;
  const brawl = t.skills?.Brawl ?? 0;
  const throwSk = t.skills?.Throw ?? 0;
  const pen = 0;

  const attrList = [
    ...ATTRS.map((a) => ({ name: cap(a), value: t.attrs?.[a] ?? 1 })),
    ...SOCIAL_ATTRS.map((a) => ({ name: cap(a), value: t.social_attrs?.[a] ?? 1 })),
  ];
  const skillList = TRAINER_SKILLS.map((s) => ({ name: s, value: t.skills?.[s] ?? 0 }));

  return (
    <Shell onClose={onClose} title={label} onOpenSheet={onOpenSheet}>
      <ActionBtn icon={<Zap className="h-3.5 w-3.5" />} label="Initiative"
        onClick={() => onRoll(`${label} · Initiative (Dex+Alert)`, dex + alert, pen, { characterKind: "trainer", characterId: id, imageUrl: t.image_url })} />
      <CatchButton label={label} dex={dex} throwSk={throwSk} pen={pen} onRoll={onRoll} />
      <ActionBtn icon={<Swords className="h-3.5 w-3.5" />} label="Evasion"
        onClick={() => onRoll(`${label} · Evasion (Dex+Evasion)`, dex + evasion, pen)} />
      <ActionBtn icon={<Swords className="h-3.5 w-3.5" />} label="Clash"
        onClick={() => onRoll(`${label} · Clash (Str+Brawl)`, str + brawl, pen)} />
      <GenericRollButton
        characterName={label}
        attrs={attrList}
        skills={skillList}
        painPenalty={pen}
        onRoll={onRoll}
      />
      <StatusDialogButton kind="trainer" id={id} label={label} status={t.status_conditions ?? []} />
      <AttrsDialogButton kind="trainer" id={id} label={label} />
      {extra}
    </Shell>
  );
}

function PokemonBar({ id, label, gameId, userId, onRoll, onClose, onOpenSheet, extra }: Props) {
  const { data: p } = useQuery({
    queryKey: ["token-pokemon", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon")
        .select("current_attrs, social_attrs, social_attr_points, social_attr_bonus, attr_bonus, skills, rank, image_url, hp, current_hp, status, species:species_id(abilities, base_attrs, sprite_url, types)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as {
        current_attrs: Record<string, number>;
        social_attrs: Record<string, number>;
        social_attr_points: Record<string, number>;
        social_attr_bonus: Record<string, number>;
        skills: Record<string, number>;
        rank: keyof typeof RANK_BONUS;
        image_url: string | null;
        hp: number;
        current_hp: number | null;
        species: { abilities: string[]; base_attrs: Record<string, number>; sprite_url: string | null; types: string[] };
      };
    },
  });
  const { data: moves = [] } = useQuery({
    queryKey: ["token-pokemon-moves", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon_moves")
        .select("moves(id,name,type,power,accuracy_stat,accuracy_skill,damage_stat,effect,category)")
        .eq("pokemon_id", id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.moves).filter(Boolean) as MoveData[];
    },
  });

  if (!p) return <Shell onClose={onClose} title={label} loading />;

  const attrOf = (k: string) => (p.current_attrs?.[k] ?? p.species?.base_attrs?.[k] ?? 1);
  const socialAttrOf = (k: string) => (p.social_attrs?.[k] ?? 1) + (p.social_attr_points?.[k] ?? 0) + (p.social_attr_bonus?.[k] ?? 0);
  const dex = attrOf("dexterity");
  const str = attrOf("strength");
  const alert = p.skills?.Alert ?? 0;
  const evasion = p.skills?.Evasion ?? 0;
  const clash = p.skills?.Clash ?? 0;
  const curHp = p.current_hp ?? p.hp ?? 0;
  const pen = painPenaltyFor(curHp, p.hp ?? 0);
  const displayImage = p.image_url ?? p.species?.sprite_url ?? null;

  const attrList = [
    ...POKEMON_ATTRS.map((a) => ({ name: cap(a), value: attrOf(a) })),
    ...SOCIAL_ATTRS.map((a) => ({ name: cap(a), value: socialAttrOf(a) })),
  ];
  const skillList = SKILLS.map((s) => ({ name: s, value: p.skills?.[s] ?? 0 }));

  return (
    <Shell onClose={onClose} title={label} onOpenSheet={onOpenSheet}>
      <ActionBtn icon={<Zap className="h-3.5 w-3.5" />} label="Initiative"
        onClick={() => onRoll(`${label} · Initiative (Dex+Alert)`, dex + alert, pen, { characterKind: "pokemon", characterId: id, imageUrl: displayImage })} />
      <ActionBtn icon={<Swords className="h-3.5 w-3.5" />} label="Evasion"
        onClick={() => onRoll(`${label} · Evasion (Dex+Evasion)`, dex + evasion, pen)} />
      <ActionBtn icon={<Swords className="h-3.5 w-3.5" />} label="Clash"
        onClick={() => onRoll(`${label} · Clash (Str+Clash)`, str + clash, pen)} />
      <GenericRollButton
        characterName={label}
        attrs={attrList}
        skills={skillList}
        painPenalty={pen}
        onRoll={onRoll}
      />
      <AbilitiesButton abilities={p.species?.abilities ?? []} label={label} onRoll={onRoll} />
      <MovesButton
        moves={moves}
        label={label}
        pokemonData={p}
        gameId={gameId}
        userId={userId}
        painPenalty={pen}
        imageUrl={displayImage}
      />
      <StatusDialogButton kind="pokemon" id={id} label={label} status={(p as unknown as { status?: string[] }).status ?? []} />
      <AttrsDialogButton kind="pokemon" id={id} label={label} />
      {extra}
    </Shell>
  );
}

function Shell({
  children, onClose, title, onOpenSheet, loading,
}: {
  children?: React.ReactNode;
  onClose: () => void;
  title: string;
  onOpenSheet?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="pointer-events-auto flex max-w-[92vw] flex-wrap items-center gap-1 rounded-lg border border-primary/40 bg-card/95 p-1.5 shadow-xl backdrop-blur">
      <span className="px-1.5 text-xs font-bold">{title}</span>
      {loading
        ? <span className="px-2 text-xs text-muted-foreground">…</span>
        : children}
      {onOpenSheet && (
        <Button size="sm" variant="ghost" className="h-7" onClick={onOpenSheet}>
          Sheet
        </Button>
      )}
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ActionBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" className="h-7" onClick={onClick}>
      {icon}<span className="ml-1">{label}</span>
    </Button>
  );
}

function CatchButton({
  label, dex, throwSk, pen, onRoll,
}: { label: string; dex: number; throwSk: number; pen: number; onRoll: (l: string, n: number, p?: number) => void }) {
  const [open, setOpen] = useState(false);
  const balls = [
    { k: "pokeball", n: "Pokéball", pool: 4 },
    { k: "greatball", n: "Greatball", pool: 6 },
    { k: "ultraball", n: "Ultraball", pool: 8 },
  ];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5" /><span className="ml-1">Catch</span>
      </Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Capture roll</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Dex {dex} + Throw {throwSk} + Ball bonus
        </p>
        <div className="grid gap-1.5">
          {balls.map((b) => (
            <Button
              key={b.k}
              variant="outline"
              onClick={() => {
                onRoll(`${label} · Catch w/ ${b.n}`, dex + throwSk + b.pool, pen);
                setOpen(false);
              }}
            >
              {b.n} <span className="ml-2 text-xs opacity-60">{dex + throwSk + b.pool}d6</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AbilitiesButton({
  abilities, label, onRoll,
}: { abilities: string[]; label: string; onRoll: (l: string, n: number, p?: number) => void }) {
  const [open, setOpen] = useState(false);
  if (abilities.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Sparkles className="h-3.5 w-3.5" /><span className="ml-1">Abilities</span>
      </Button>
      <DialogContent>
        <DialogHeader><DialogTitle>Use ability</DialogTitle></DialogHeader>
        <div className="grid gap-1.5">
          {abilities.map((a) => (
            <Button
              key={a}
              variant="outline"
              onClick={() => {
                onRoll(`${label} · Ability: ${a}`, 0);
                setOpen(false);
              }}
            >{a}</Button>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Lança apenas o log da habilidade — sem rolagem. Use a ficha para efeitos com dados.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MovesButton({
  moves, label, pokemonData, gameId, userId, painPenalty, imageUrl,
}: {
  moves: MoveData[];
  label: string;
  pokemonData: {
    current_attrs: Record<string, number>;
    social_attrs: Record<string, number>;
    social_attr_points: Record<string, number>;
    social_attr_bonus: Record<string, number>;
    skills: Record<string, number>;
    species: { base_attrs: Record<string, number>; types: string[] };
  };
  gameId: string;
  userId: string;
  painPenalty: number;
  imageUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  if (moves.length === 0) return null;
  const types = pokemonData.species?.types ?? [];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Dices className="h-3.5 w-3.5" /><span className="ml-1">Moves</span>
      </Button>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>{label} — Moves</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {moves.map((m) => {
            const stats = computeMoveStats(m, {
              current_attrs: pokemonData.current_attrs,
              social_attrs: pokemonData.social_attrs,
              social_attr_points: pokemonData.social_attr_points,
              social_attr_bonus: pokemonData.social_attr_bonus,
              skills: pokemonData.skills,
              base_attrs: pokemonData.species?.base_attrs,
            }, types);
            return (
              <MoveCard
                key={m.id}
                hasStab={stats.hasStab}
                data={{
                  name: m.name,
                  type: m.type as string,
                  power: m.power,
                  accuracyText: stats.accuracyText,
                  damagePoolText: stats.damagePoolText,
                  effect: m.effect ?? "",
                  category: m.category,
                }}
                accuracySlot={
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                    {stats.accPool}d6 <span className="opacity-70">({stats.accuracyText})</span>
                  </span>
                }
                damageSlot={
                  stats.isStatus ? (
                    <span className="text-muted-foreground">Status (no damage)</span>
                  ) : (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-bold text-destructive">
                      {stats.dmgPool}d6 <span className="opacity-70">({stats.damagePoolText})</span>
                    </span>
                  )
                }
                footer={
                  <MoveRollDialog
                    move={m}
                    pokemonName={label}
                    accPool={stats.accPool}
                    dmgPool={stats.dmgPool}
                    isStatus={stats.isStatus}
                    isSpecial={stats.isSpecial}
                    hasStab={stats.hasStab}
                    accuracyText={stats.accuracyText}
                    damagePoolText={stats.damagePoolText}
                    gameId={gameId}
                    userId={userId}
                    painPenalty={painPenalty}
                    imageUrl={imageUrl}
                  />
                }
              />
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function StatusDialogButton({
  kind, id, label, status,
}: { kind: "trainer" | "pokemon"; id: string; label: string; status: string[] }) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<string[]>(status);
  const qc = useQueryClient();
  const col = kind === "trainer" ? "status_conditions" : "status";
  async function save(next: string[]) {
    setLocal(next);
    const table = kind === "trainer" ? "trainers" : "pokemon";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from(table) as any).update({ [col]: next }).eq("id", id);
    qc.invalidateQueries({ queryKey: [kind === "trainer" ? "token-trainer" : "token-pokemon", id] });
    qc.invalidateQueries({ queryKey: [kind === "trainer" ? "trainer" : "pokemon", id] });
  }
  function toggle(name: string, on: boolean) {
    const set = new Set(local);
    if (on) set.add(name); else set.delete(name);
    save(Array.from(set));
  }
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setLocal(status); }}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Heart className="h-3.5 w-3.5" /><span className="ml-1">Status</span>
        {local.length > 0 && <span className="ml-1 rounded-full bg-destructive/20 px-1 text-[10px] text-destructive">{local.length}</span>}
      </Button>
      <DialogContent>
        <DialogHeader><DialogTitle>{label} — Status conditions</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-1.5">
          {STATUS_CONDITIONS.map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
              <Checkbox checked={local.includes(c)} onCheckedChange={(v) => toggle(c, !!v)} />
              <span className="truncate">{c}</span>
            </label>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttrsDialogButton({
  kind, id, label,
}: { kind: "trainer" | "pokemon"; id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const table = kind === "trainer" ? "trainers" : "pokemon";
  const attrCol = kind === "trainer" ? "attrs" : "current_attrs";
  const physAttrs = kind === "trainer" ? ATTRS : POKEMON_ATTRS;

  const { data, refetch } = useQuery({
    queryKey: ["token-attrs", kind, id, open],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from(table) as any)
        .select(`${attrCol}, attr_bonus, social_attrs, social_attr_bonus${kind === "pokemon" ? ", modifiers" : ""}`)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as {
        [k: string]: Record<string, number> | null;
      };
    },
    enabled: open,
  });

  async function patchBonus(field: "attr_bonus" | "social_attr_bonus", key: string, value: number) {
    const cur = (data?.[field] ?? {}) as Record<string, number>;
    const next = { ...cur, [key]: value };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from(table) as any).update({ [field]: next }).eq("id", id);
    refetch();
    qc.invalidateQueries({ queryKey: [kind === "trainer" ? "token-trainer" : "token-pokemon", id] });
    qc.invalidateQueries({ queryKey: [kind === "trainer" ? "trainer" : "pokemon", id] });
  }

  async function patchModBonus(key: "_def_bonus" | "_spdef_bonus", value: number) {
    if (kind !== "pokemon") return;
    const cur = ((data?.modifiers as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const next = { ...cur, [key]: value };
    await supabase.from("pokemon").update({ modifiers: next }).eq("id", id);
    refetch();
    qc.invalidateQueries({ queryKey: ["token-pokemon", id] });
    qc.invalidateQueries({ queryKey: ["token-pokemon-stats", id] });
    qc.invalidateQueries({ queryKey: ["pokemon", id] });
  }

  const attrs = (data?.[attrCol] ?? {}) as Record<string, number>;
  const attrBonus = (data?.attr_bonus ?? {}) as Record<string, number>;
  const social = (data?.social_attrs ?? {}) as Record<string, number>;
  const socialBonus = (data?.social_attr_bonus ?? {}) as Record<string, number>;
  const modifiers = ((data?.modifiers as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const defBonus = Number(modifiers._def_bonus ?? 0) || 0;
  const spdefBonus = Number(modifiers._spdef_bonus ?? 0) || 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Activity className="h-3.5 w-3.5" /><span className="ml-1">Attrs</span>
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{label} — Atributos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-bold">Físicos</Label>
            <div className="mt-1 space-y-1">
              {physAttrs.map((a) => (
                <BonusRow
                  key={a}
                  name={cap(a)}
                  base={attrs[a] ?? 1}
                  bonus={attrBonus[a] ?? 0}
                  onBonus={(v) => patchBonus("attr_bonus", a, v)}
                />
              ))}
            </div>
          </div>
          {kind === "pokemon" && (
            <div>
              <Label className="text-xs font-bold">Defesas (bônus extra)</Label>
              <div className="mt-1 space-y-1">
                <BonusRow
                  name="Def"
                  base={(attrs.vitality ?? 1)}
                  bonus={defBonus}
                  onBonus={(v) => patchModBonus("_def_bonus", v)}
                />
                <BonusRow
                  name="SpDef"
                  base={(attrs.insight ?? attrs.vitality ?? 1)}
                  bonus={spdefBonus}
                  onBonus={(v) => patchModBonus("_spdef_bonus", v)}
                />
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs font-bold">Sociais</Label>
            <div className="mt-1 space-y-1">
              {SOCIAL_ATTRS.map((a) => (
                <BonusRow
                  key={a}
                  name={cap(a)}
                  base={social[a] ?? 1}
                  bonus={socialBonus[a] ?? 0}
                  onBonus={(v) => patchBonus("social_attr_bonus", a, v)}
                />
              ))}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">Bônus rápido (positivo ou negativo). Salvo automaticamente na ficha.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BonusRow({
  name, base, bonus, onBonus,
}: { name: string; base: number; bonus: number; onBonus: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs">
      <span className="flex-1 truncate font-semibold">{name}</span>
      <span className="opacity-60">base {base}</span>
      <Input
        type="number"
        value={bonus}
        onChange={(e) => onBonus(parseInt(e.target.value) || 0)}
        className="h-7 w-16 text-xs"
      />
      <span className="text-[10px] opacity-60">= {base + bonus}</span>
    </div>
  );
}
