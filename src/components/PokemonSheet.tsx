import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { DotEditor } from "@/components/DotEditor";
import {
  ATTRS, POKEMON_ATTRS, RANKS, RANK_LABELS, RANK_BONUS, TYPE_COLORS, type Rank,
  rankAtLeast,
} from "@/lib/pokerole";
import { toast } from "sonner";
import { Plus, Dices, Trash2 } from "lucide-react";

type Species = {
  id: string;
  name: string;
  types: string[];
  base_hp: number;
  base_attrs: Record<string, number>;
  attr_limits: Record<string, number>;
  abilities: string[];
  hidden_ability: string | null;
  suggested_rank: Rank | null;
  sprite_url: string | null;
};

type Move = {
  id: string;
  name: string;
  type: keyof typeof TYPE_COLORS;
  power: number;
  accuracy_stat: string | null;
  accuracy_skill: string | null;
  damage_stat: string | null;
  effect: string;
  category: string;
};

type Pokemon = {
  id: string;
  game_id: string;
  owner_id: string;
  species_id: string;
  nickname: string | null;
  rank: Rank;
  current_attrs: Record<string, number>;
  modifiers: Record<string, number>;
  hp: number;
  will: number;
  status: string[];
  notes: string;
};

export function PokemonSheet({
  pokemonId,
  gameId,
  userId,
  isNarrator,
  onRoll,
}: {
  pokemonId: string;
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onRoll: (label: string, n: number) => void;
}) {
  const qc = useQueryClient();

  const { data: pokemon } = useQuery({
    queryKey: ["pokemon", pokemonId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pokemon").select("*").eq("id", pokemonId).single();
      if (error) throw error;
      return data as Pokemon;
    },
  });

  const { data: species } = useQuery({
    queryKey: ["species", pokemon?.species_id],
    enabled: !!pokemon?.species_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("species").select("*").eq("id", pokemon!.species_id).single();
      if (error) throw error;
      return data as Species;
    },
  });

  const { data: learnable = [] } = useQuery({
    queryKey: ["species-moves", pokemon?.species_id],
    enabled: !!pokemon?.species_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("species_moves")
        .select("min_rank, moves(*)")
        .eq("species_id", pokemon!.species_id);
      if (error) throw error;
      return (data ?? []) as { min_rank: Rank; moves: Move }[];
    },
  });

  const { data: knownMoves = [] } = useQuery({
    queryKey: ["pokemon-moves", pokemonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon_moves")
        .select("moves(*)")
        .eq("pokemon_id", pokemonId);
      if (error) throw error;
      return (data ?? []).map((r: { moves: Move }) => r.moves);
    },
  });

  const canEdit = !!pokemon && (pokemon.owner_id === userId || isNarrator);

  // Auto-init current_attrs from species base if empty
  useEffect(() => {
    if (pokemon && species && Object.keys(pokemon.current_attrs).length === 0) {
      void supabase.from("pokemon").update({
        current_attrs: species.base_attrs,
        hp: species.base_hp + (species.base_attrs.vitality ?? 1) + RANK_BONUS[pokemon.rank],
      }).eq("id", pokemonId).then(() => qc.invalidateQueries({ queryKey: ["pokemon", pokemonId] }));
    }
  }, [pokemon, species, pokemonId, qc]);

  const insight = pokemon?.current_attrs.insight ?? 1;
  const moveCap = insight + 2;

  const filteredLearnable = useMemo(() => {
    if (!pokemon) return [];
    return learnable
      .filter(({ min_rank }) => rankAtLeast(min_rank, pokemon.rank))
      .filter(({ moves: m }) => !knownMoves.some((km) => km.id === m.id));
  }, [learnable, knownMoves, pokemon]);

  if (!pokemon) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  if (!species) return <div className="p-4 text-sm text-muted-foreground">Loading species…</div>;

  async function patch(p: Partial<Pokemon>) {
    const { error } = await supabase.from("pokemon").update(p).eq("id", pokemonId);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["pokemon", pokemonId] });
  }

  async function setAttr(key: string, val: number) {
    if (!canEdit) return;
    const limit = species!.attr_limits[key] ?? 5;
    const clamped = Math.min(val, limit);
    const newAttrs = { ...pokemon!.current_attrs, [key]: clamped };
    const vit = key === "vitality" ? clamped : (newAttrs.vitality ?? 1);
    const str = key === "strength" ? clamped : (newAttrs.strength ?? 1);
    const tough = key === "toughness" ? clamped : (newAttrs.toughness ?? 1);
    const ins = key === "insight" ? clamped : (newAttrs.insight ?? 1);
    await patch({
      current_attrs: newAttrs,
      hp: species!.base_hp + vit + str + RANK_BONUS[pokemon!.rank],
      will: ins + tough + RANK_BONUS[pokemon!.rank],
    });
  }

  async function addMove(moveId: string) {
    const { error } = await supabase.from("pokemon_moves").insert({ pokemon_id: pokemonId, move_id: moveId });
    if (error) {
      toast.error(error.message);
    } else {
      qc.invalidateQueries({ queryKey: ["pokemon-moves", pokemonId] });
    }
  }

  async function removeMove(moveId: string) {
    await supabase.from("pokemon_moves").delete()
      .eq("pokemon_id", pokemonId).eq("move_id", moveId);
    qc.invalidateQueries({ queryKey: ["pokemon-moves", pokemonId] });
  }

  return (
    <div className="space-y-5 p-4">
      {/* Header */}
      <div className="flex gap-4">
        {species.sprite_url && (
          <img src={species.sprite_url} alt={species.name} className="h-24 w-24 rounded-xl bg-muted object-contain" />
        )}
        <div className="flex-1 space-y-2">
          <Input
            disabled={!canEdit}
            value={pokemon.nickname ?? ""}
            placeholder={species.name}
            onChange={(e) => patch({ nickname: e.target.value })}
            className="text-lg font-bold"
          />
          <div className="flex flex-wrap items-center gap-2">
            {species.types.map((t) => (
              <Badge
                key={t}
                style={{ backgroundColor: TYPE_COLORS[t as keyof typeof TYPE_COLORS]?.bg, color: TYPE_COLORS[t as keyof typeof TYPE_COLORS]?.fg }}
                className="border-none capitalize"
              >{t}</Badge>
            ))}
            <span className="text-xs text-muted-foreground">{species.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-xs">Rank</Label>
            <Select
              value={pokemon.rank}
              onValueChange={(v) => canEdit && patch({ rank: v as Rank })}
              disabled={!canEdit}
            >
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANKS.map((r) => (
                  <SelectItem key={r} value={r}>{RANK_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm">
              <span className="rounded-full bg-success/15 px-2.5 py-0.5 font-bold text-success">HP {pokemon.hp}</span>
              <span className="ml-2 rounded-full bg-accent px-2.5 py-0.5 font-bold">Will {pokemon.will}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Attributes */}
      <section>
        <h3 className="mb-2 text-sm font-bold">Attributes</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {ATTRS.filter((a) => species.base_attrs[a] !== undefined || a === "vitality" || a === "insight").map((a) => {
            const val = pokemon.current_attrs[a] ?? species.base_attrs[a] ?? 1;
            const limit = species.attr_limits[a] ?? 5;
            const mod = pokemon.modifiers[a] ?? 0;
            return (
              <div key={a} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                <span className="w-24 text-sm font-medium capitalize">{a}</span>
                <DotEditor
                  value={val}
                  max={Math.max(5, limit)}
                  cap={limit}
                  onChange={(n) => setAttr(a, n)}
                  disabled={!canEdit}
                />
                <Input
                  type="number"
                  value={mod}
                  onChange={(e) => patch({ modifiers: { ...pokemon.modifiers, [a]: parseInt(e.target.value) || 0 } })}
                  disabled={!canEdit}
                  className="ml-2 h-7 w-14 text-xs"
                />
                <Button
                  size="sm" variant="ghost" className="ml-1 h-7 px-2"
                  onClick={() => onRoll(`${a} check`, val + mod)}
                ><Dices className="h-3.5 w-3.5" /></Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Abilities */}
      <section>
        <h3 className="mb-2 text-sm font-bold">Abilities</h3>
        <div className="flex flex-wrap gap-1.5">
          {species.abilities.map((a) => <Badge key={a} variant="secondary">{a}</Badge>)}
          {species.hidden_ability && (
            <Badge variant="outline" className="border-primary text-primary">{species.hidden_ability} (hidden)</Badge>
          )}
        </div>
      </section>

      {/* Moves */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold">Moves <span className="font-normal text-muted-foreground">({knownMoves.length} / {moveCap})</span></h3>
          {canEdit && (
            <AddMoveDialog
              available={filteredLearnable.map((l) => l.moves)}
              onAdd={addMove}
              atCap={knownMoves.length >= moveCap}
              moveCap={moveCap}
            />
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {knownMoves.map((m) => {
            const tcol = TYPE_COLORS[m.type] ?? { bg: "#888", fg: "#fff" };
            const attrName = m.damage_stat ?? "strength";
            const attrVal = pokemon.current_attrs[attrName] ?? 1;
            const rollPool = m.power + attrVal;
            return (
              <div key={m.id} className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-between px-3 py-1.5" style={{ backgroundColor: tcol.bg, color: tcol.fg }}>
                  <span className="text-sm font-bold">{m.name}</span>
                  <span className="text-xs uppercase opacity-90">{m.type}</span>
                </div>
                <div className="space-y-2 bg-card p-3">
                  <div className="text-xs text-muted-foreground">
                    Power {m.power} · Accuracy {m.accuracy_stat ?? "—"} {m.accuracy_skill ? `+ ${m.accuracy_skill}` : ""}
                  </div>
                  {m.effect && <p className="text-xs">{m.effect}</p>}
                  <div className="flex items-center justify-between">
                    <Button size="sm" onClick={() => onRoll(`${m.name} (${m.type})`, rollPool)}>
                      <Dices className="mr-1.5 h-3.5 w-3.5" /> Roll {rollPool}d10
                    </Button>
                    {canEdit && (
                      <Button size="icon" variant="ghost" onClick={() => removeMove(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function AddMoveDialog({
  available, onAdd, atCap, moveCap,
}: {
  available: Move[]; onAdd: (id: string) => void; atCap: boolean; moveCap: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = available.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={() => {
          if (atCap) { toast.error(`This Pokémon has reached the maximum number of moves (${moveCap}).`); }
        }} disabled={atCap}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Move
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[70vh] overflow-hidden">
        <DialogHeader><DialogTitle>Learnable moves</DialogTitle></DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => { onAdd(m.id); setOpen(false); }}
              className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left hover:border-primary"
            >
              <div>
                <div className="text-sm font-semibold">{m.name}</div>
                <div className="text-xs text-muted-foreground">Power {m.power} · {m.category}</div>
              </div>
              <Badge style={{ backgroundColor: TYPE_COLORS[m.type]?.bg, color: TYPE_COLORS[m.type]?.fg }} className="border-none capitalize">{m.type}</Badge>
            </button>
          ))}
          {filtered.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No moves available at this rank.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
