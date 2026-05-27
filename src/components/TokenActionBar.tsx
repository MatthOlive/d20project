import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Swords, Zap, Sparkles, Dices, X } from "lucide-react";
import { GenericRollButton } from "@/components/SheetRolls";
import { POKEMON_ATTRS, ATTRS, SOCIAL_ATTRS, TRAINER_SKILLS, SKILLS, RANK_BONUS } from "@/lib/pokerole";

type Props = {
  kind: "trainer" | "pokemon";
  id: string;
  label: string;
  onRoll: (label: string, n: number, penalty?: number, meta?: { characterKind: "trainer" | "pokemon"; characterId: string; imageUrl?: string | null }) => void;
  onClose: () => void;
  onOpenSheet: () => void;
};

export function TokenActionBar(p: Props) {
  if (p.kind === "trainer") return <TrainerBar {...p} />;
  return <PokemonBar {...p} />;
}

function TrainerBar({ id, label, onRoll, onClose, onOpenSheet }: Props) {
  const { data: t } = useQuery({
    queryKey: ["token-trainer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .select("attrs, social_attrs, skills, rank, confidence, current_hp, status_conditions")
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
  // pain penalty not stored here; default 0 (sheet handles full math)
  const pen = 0;

  const attrList = [
    ...ATTRS.map((a) => ({ name: cap(a), value: t.attrs?.[a] ?? 1 })),
    ...SOCIAL_ATTRS.map((a) => ({ name: cap(a), value: t.social_attrs?.[a] ?? 1 })),
  ];
  const skillList = TRAINER_SKILLS.map((s) => ({ name: s, value: t.skills?.[s] ?? 0 }));

  return (
    <Shell onClose={onClose} title={label} onOpenSheet={onOpenSheet}>
      <ActionBtn icon={<Zap className="h-3.5 w-3.5" />} label="Initiative"
        onClick={() => onRoll(`${label} · Initiative (Dex+Alert)`, dex + alert, pen)} />
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
    </Shell>
  );
}

function PokemonBar({ id, label, onRoll, onClose, onOpenSheet }: Props) {
  const { data: p } = useQuery({
    queryKey: ["token-pokemon", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon")
        .select("current_attrs, social_attrs, skills, rank, species:species_id(abilities, base_attrs)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as {
        current_attrs: Record<string, number>;
        social_attrs: Record<string, number>;
        skills: Record<string, number>;
        rank: keyof typeof RANK_BONUS;
        species: { abilities: string[]; base_attrs: Record<string, number> };
      };
    },
  });
  const { data: moves = [] } = useQuery({
    queryKey: ["token-pokemon-moves", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon_moves")
        .select("moves(id,name,type,power,accuracy_stat,accuracy_skill,damage_stat,category)")
        .eq("pokemon_id", id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.moves).filter(Boolean) as Array<{
        id: string; name: string; type: string; power: number;
        accuracy_stat: string | null; accuracy_skill: string | null;
        damage_stat: string | null; category: string;
      }>;
    },
  });

  if (!p) return <Shell onClose={onClose} title={label} loading />;

  const attrOf = (k: string) => (p.current_attrs?.[k] ?? p.species?.base_attrs?.[k] ?? 1);
  const dex = attrOf("dexterity");
  const str = attrOf("strength");
  const alert = p.skills?.Alert ?? 0;
  const evasion = p.skills?.Evasion ?? 0;
  const clash = p.skills?.Clash ?? 0;
  const pen = 0;

  const attrList = [
    ...POKEMON_ATTRS.map((a) => ({ name: cap(a), value: attrOf(a) })),
    ...SOCIAL_ATTRS.map((a) => ({ name: cap(a), value: p.social_attrs?.[a] ?? 1 })),
  ];
  const skillList = SKILLS.map((s) => ({ name: s, value: p.skills?.[s] ?? 0 }));

  return (
    <Shell onClose={onClose} title={label} onOpenSheet={onOpenSheet}>
      <ActionBtn icon={<Zap className="h-3.5 w-3.5" />} label="Initiative"
        onClick={() => onRoll(`${label} · Initiative (Dex+Alert)`, dex + alert, pen)} />
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
      <MovesButton moves={moves} label={label} attrs={p.current_attrs} skills={p.skills} baseAttrs={p.species?.base_attrs ?? {}} onRoll={onRoll} />
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
  moves, label, attrs, skills, baseAttrs, onRoll,
}: {
  moves: { id: string; name: string; type: string; power: number; accuracy_stat: string | null; accuracy_skill: string | null; damage_stat: string | null; category: string }[];
  label: string;
  attrs: Record<string, number>;
  skills: Record<string, number>;
  baseAttrs: Record<string, number>;
  onRoll: (l: string, n: number, p?: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (moves.length === 0) return null;
  const get = (k: string | null) => {
    if (!k) return 0;
    const key = k.toLowerCase();
    if (key in skills) return skills[key];
    const titled = key.charAt(0).toUpperCase() + key.slice(1);
    if (titled in skills) return skills[titled];
    if (key in attrs) return attrs[key];
    if (key in baseAttrs) return attrs[key] ?? baseAttrs[key];
    return 0;
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(true)}>
        <Dices className="h-3.5 w-3.5" /><span className="ml-1">Moves</span>
      </Button>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Use move</DialogTitle></DialogHeader>
        <div className="grid gap-1.5">
          {moves.map((m) => {
            const accAttr = get(m.accuracy_stat);
            const accSk = get(m.accuracy_skill);
            const accuracy = accAttr + accSk;
            return (
              <div key={m.id} className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{m.name}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">{m.type} · {m.category} · pow {m.power}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRoll(`${label} · ${m.name} (accuracy)`, accuracy)}
                >Acc {accuracy}d6</Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
