import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  POKEMON_ATTRS, SOCIAL_ATTRS, RANKS, RANK_LABELS, RANK_BONUS, TYPE_COLORS, SKILLS, type Rank,
  rankAtLeast,
} from "@/lib/pokerole";
import { useDebouncedPatch } from "@/lib/use-debounced-patch";
import { toast } from "sonner";
import { Plus, Dices, Trash2, ImagePlus, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

// Z-Move names per type (Pokérole 2.0)
const Z_MOVE_NAMES: Record<string, string> = {
  normal: "Breakneck Blitz", fire: "Inferno Overwhelming", water: "Hydro Vortex",
  electric: "Gigavolt Havoc", grass: "Bloom Doom", ice: "Subzero Slammer",
  fighting: "All-Out Pummeling", poison: "Acid Downpour", ground: "Tectonic Rage",
  flying: "Supersonic Skystrike", psychic: "Shattered Psyche", bug: "Savage Spin-Out",
  rock: "Continental Crush", ghost: "Never-Ending Nightmare", dragon: "Devastating Drake",
  dark: "Black Hole Eclipse", steel: "Corkscrew Crash", fairy: "Twinkle Tackle",
  typeless: "Breakneck Blitz",
};
// Z-Move power bumps per base power bracket (Pokérole 2.0)
function zMovePower(p: number): number {
  if (p <= 0) return 0;
  if (p <= 3) return p + 5;
  if (p <= 5) return p + 4;
  if (p <= 7) return p + 3;
  return p + 2;
}

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
  social_attrs: Record<string, number>;
  skills: Record<string, number>;
  modifiers: Record<string, number>;
  hp: number;
  will: number;
  status: string[];
  notes: string;
  image_url: string | null;
  nature: string | null;
  held_item: string | null;
  happiness: number;
  loyalty: number;
  confidence: number;
  battles: number;
  victories: number;
};

export function PokemonSheet({
  pokemonId,
  gameId: _gameId,
  userId,
  isNarrator,
  onRoll,
  onChat,
}: {
  pokemonId: string;
  gameId: string;
  userId: string;
  isNarrator: boolean;
  onRoll: (label: string, n: number) => void;
  onChat: (body: string) => void;
}) {
  const qc = useQueryClient();
  const [zMode, setZMode] = useState(false);
  const [gMaxMode, setGMaxMode] = useState(false);

  const queryKey = useMemo(() => ["pokemon", pokemonId], [pokemonId]);
  const { data: pokemon } = useQuery({
    queryKey,
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

  const commit = useCallback(async (p: Partial<Pokemon>) => {
    const { error } = await supabase.from("pokemon").update(p).eq("id", pokemonId);
    if (error) toast.error(error.message);
  }, [pokemonId]);
  const { patch } = useDebouncedPatch<Pokemon>(queryKey, commit);

  // Auto-init current_attrs from species base if empty
  useEffect(() => {
    if (pokemon && species && Object.keys(pokemon.current_attrs).length === 0) {
      void supabase.from("pokemon").update({
        current_attrs: species.base_attrs,
        hp: species.base_hp + (species.base_attrs.vitality ?? 1),
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

  async function setAttr(key: string, val: number) {
    if (!canEdit) return;
    const limit = species!.attr_limits[key] ?? 5;
    const clamped = Math.min(val, limit);
    const newAttrs = { ...pokemon!.current_attrs, [key]: clamped };
    const vit = key === "vitality" ? clamped : (newAttrs.vitality ?? 1);
    const ins = key === "insight" ? clamped : (newAttrs.insight ?? 1);
    patch({
      current_attrs: newAttrs,
      hp: species!.base_hp + vit,
      will: ins + 2,
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

  async function uploadImage(file: File) {
    if (!canEdit) return;
    if (file.size > 2_000_000) { toast.error("Image must be under 2 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => patch({ image_url: reader.result as string });
    reader.readAsDataURL(file);
  }

  const displayImage = pokemon.image_url ?? species.sprite_url;

  return (
    <div className="space-y-5 p-4">
      {/* Header */}
      <div className="flex gap-4">
        <div className="group relative">
          {displayImage ? (
            <img src={displayImage} alt={species.name} className="h-24 w-24 rounded-xl bg-muted object-contain" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">No image</div>
          )}
          {canEdit && (
            <div className="absolute inset-0 flex items-end justify-center gap-1 rounded-xl bg-black/40 p-1 opacity-0 transition group-hover:opacity-100">
              <label className="cursor-pointer rounded bg-card px-2 py-0.5 text-[10px] font-semibold hover:bg-accent">
                <ImagePlus className="inline h-3 w-3" />
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              </label>
              {pokemon.image_url && (
                <button
                  onClick={() => patch({ image_url: null })}
                  className="cursor-pointer rounded bg-card px-2 py-0.5 text-[10px] font-semibold hover:bg-accent"
                  title="Reset to sprite"
                ><RotateCcw className="inline h-3 w-3" /></button>
              )}
            </div>
          )}
        </div>
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
            <div className="ml-auto flex flex-wrap items-center gap-1.5 text-sm">
              <span className="rounded-full bg-success/15 px-2.5 py-0.5 font-bold text-success">HP {pokemon.hp}</span>
              <span className="rounded-full bg-accent px-2.5 py-0.5 font-bold">Will {pokemon.will}</span>
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-bold text-primary">Def {pokemon.current_attrs.vitality ?? 1}</span>
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-bold text-primary">SpDef {pokemon.current_attrs.vitality ?? 1}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(() => {
              const dex = pokemon.current_attrs.dexterity ?? 1;
              const str = pokemon.current_attrs.strength ?? 1;
              const alert = pokemon.skills?.Alert ?? 0;
              const clashSkill = pokemon.skills?.Clash ?? 0;
              const evasionSkill = pokemon.skills?.Evasion ?? 0;
              const init = dex + alert;
              const clash = str + clashSkill;
              const evasion = dex + evasionSkill;
              const name = pokemon.nickname || species.name;
              return (
                <>
                  <Button size="sm" variant="outline" className="h-7"
                    onClick={() => onRoll(`${name} · Initiative (Dex+Alert)`, init)}>
                    <Dices className="mr-1 h-3.5 w-3.5" /> Initiative · {init}d6
                  </Button>
                  <Button size="sm" variant="outline" className="h-7"
                    onClick={() => onRoll(`${name} · Clash (Str+Clash)`, clash)}>
                    <Dices className="mr-1 h-3.5 w-3.5" /> Clash · {clash}d6
                  </Button>
                  <Button size="sm" variant="outline" className="h-7"
                    onClick={() => onRoll(`${name} · Evasion (Dex+Evasion)`, evasion)}>
                    <Dices className="mr-1 h-3.5 w-3.5" /> Evasion · {evasion}d6
                  </Button>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Details */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Nature</Label>
          <NatureSelect
            value={pokemon.nature}
            disabled={!canEdit}
            onChange={(nature, conf) => patch({ nature, confidence: conf })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Held item</Label>
          <Input value={pokemon.held_item ?? ""} onChange={(e) => patch({ held_item: e.target.value })} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Confidence</Label>
          <Input type="number" value={pokemon.confidence}
            onChange={(e) => patch({ confidence: parseInt(e.target.value) || 0 })} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Happiness</Label>
          <Input type="number" value={pokemon.happiness}
            onChange={(e) => patch({ happiness: parseInt(e.target.value) || 0 })} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Loyalty</Label>
          <Input type="number" value={pokemon.loyalty}
            onChange={(e) => patch({ loyalty: parseInt(e.target.value) || 0 })} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Battles</Label>
          <Input type="number" value={pokemon.battles}
            onChange={(e) => patch({ battles: parseInt(e.target.value) || 0 })} disabled={!canEdit} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Victories</Label>
          <Input type="number" value={pokemon.victories}
            onChange={(e) => patch({ victories: parseInt(e.target.value) || 0 })} disabled={!canEdit} />
        </div>
      </section>

      {/* Attributes */}
      <section>
        <h3 className="mb-2 text-sm font-bold">Attributes</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {POKEMON_ATTRS.map((a) => {
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

      {/* Social attributes */}
      <section>
        <h3 className="mb-2 text-sm font-bold">Social Attributes</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {SOCIAL_ATTRS.map((a) => {
            const v = pokemon.social_attrs?.[a] ?? 1;
            return (
              <div key={a} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                <span className="w-24 text-sm font-medium capitalize">{a}</span>
                <DotEditor
                  value={v}
                  max={5}
                  onChange={(n) => patch({ social_attrs: { ...pokemon.social_attrs, [a]: n } })}
                  disabled={!canEdit}
                />
                <Button size="sm" variant="ghost" className="ml-1 h-7 px-2"
                  onClick={() => onRoll(`${a} check`, v)}>
                  <Dices className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Skills */}
      <section>
        <h3 className="mb-2 text-sm font-bold">Skills</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {SKILLS.map((s) => {
            const v = pokemon.skills?.[s] ?? 0;
            return (
              <div key={s} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                <span className="text-sm">{s}</span>
                <DotEditor
                  value={v}
                  max={5}
                  onChange={(n) => patch({ skills: { ...pokemon.skills, [s]: n } })}
                  disabled={!canEdit}
                />
              </div>
            );
          })}
        </div>
      </section>



      {/* Moves */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">Moves <span className="font-normal text-muted-foreground">({knownMoves.length} / {moveCap})</span></h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
              <Checkbox checked={zMode} onCheckedChange={(v) => { setZMode(!!v); if (v) setGMaxMode(false); }} /> Z-Move
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
              <Checkbox checked={gMaxMode} onCheckedChange={(v) => { setGMaxMode(!!v); if (v) setZMode(false); }} /> G-Max
            </label>
            {canEdit && (
              <AddMoveDialog
                available={filteredLearnable.map((l) => l.moves)}
                onAdd={addMove}
                atCap={knownMoves.length >= moveCap}
                moveCap={moveCap}
              />
            )}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {knownMoves.map((baseMove) => {
            // Apply Z-Move or G-Max transformation for display + damage roll
            const m: Move = (() => {
              if (zMode && baseMove.power > 0) {
                return {
                  ...baseMove,
                  name: Z_MOVE_NAMES[baseMove.type] ?? `Z-${baseMove.name}`,
                  power: zMovePower(baseMove.power),
                };
              }
              if (gMaxMode && baseMove.power > 0) {
                return {
                  ...baseMove,
                  name: `G-Max ${baseMove.name}`,
                  power: baseMove.power + 3,
                };
              }
              return baseMove;
            })();
            const tcol = TYPE_COLORS[m.type] ?? { bg: "#888", fg: "#fff" };
            const accStat = m.accuracy_stat ?? "dexterity";
            const accAttrVal = pokemon.current_attrs[accStat] ?? 1;
            const accSkillVal = m.accuracy_skill ? (pokemon.skills?.[m.accuracy_skill] ?? 0) : 0;
            const accPool = accAttrVal + accSkillVal;
            const cat = (m.category ?? "").toLowerCase();
            const isStatus = cat === "support" || cat === "status" || m.power <= 0 || !m.damage_stat;
            const dmgStat = m.damage_stat ?? "strength";
            const dmgAttrVal = pokemon.current_attrs[dmgStat] ?? 1;
            const dmgPool = isStatus ? 0 : m.power + dmgAttrVal;
            const name = pokemon.nickname || species.name;
            return (
              <div key={m.id} className="overflow-hidden rounded-lg border border-border">
                <div className="flex items-center justify-between px-3 py-1.5" style={{ backgroundColor: tcol.bg, color: tcol.fg }}>
                  <span className="text-sm font-bold">{m.name}</span>
                  <span className="text-xs uppercase opacity-90">{m.type}</span>
                </div>
                <div className="space-y-2 bg-card p-3">
                  <div className="text-xs text-muted-foreground">
                    Accuracy {accStat}{m.accuracy_skill ? `+${m.accuracy_skill}` : ""} · {accPool}d6
                    {isStatus ? " · Status (no damage)" : ` · Damage ${dmgStat}+Power · ${dmgPool}d6`}
                  </div>
                  {m.effect && <p className="text-xs">{m.effect}</p>}
                  <div className="flex items-center justify-between">
                    <MoveRollDialog
                      move={m}
                      pokemonName={name}
                      accPool={accPool}
                      dmgPool={dmgPool}
                      isStatus={isStatus}
                      onRoll={onRoll}
                      onChat={onChat}
                    />

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



      <section>
        <Label className="text-xs">Notes</Label>
        <Textarea value={pokemon.notes} onChange={(e) => patch({ notes: e.target.value })} disabled={!canEdit} rows={3} />
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

function MoveRollDialog({
  move, pokemonName, accPool, dmgPool, isStatus, onRoll, onChat,
}: {
  move: Move;
  pokemonName: string;
  accPool: number;
  dmgPool: number;
  isStatus?: boolean;
  onRoll: (label: string, n: number) => void;
  onChat: (body: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [accBonus, setAccBonus] = useState(0);
  const [dmgBonus, setDmgBonus] = useState(0);
  function confirm() {
    const desc = `**${pokemonName}** uses **${move.name}** (${move.type})${move.effect ? ` — ${move.effect}` : ""}`;
    onChat(desc);
    onRoll(`${pokemonName} · ${move.name} · Accuracy`, Math.max(0, accPool + accBonus));
    if (!isStatus && dmgPool > 0) {
      onRoll(`${pokemonName} · ${move.name} · Damage`, Math.max(0, dmgPool + dmgBonus));
    }
    setOpen(false);
    setAccBonus(0);
    setDmgBonus(0);
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Dices className="mr-1.5 h-3.5 w-3.5" /> Roll {accPool}d6{isStatus ? "" : ` / ${dmgPool}d6`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{move.name}</DialogTitle></DialogHeader>
        {move.effect && <p className="text-sm text-muted-foreground">{move.effect}</p>}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">Accuracy bonus dice</Label>
              <p className="text-[11px] text-muted-foreground">Pool: {accPool}d6 → rolling {Math.max(0, accPool + accBonus)}d6</p>
            </div>
            <Input type="number" value={accBonus} onChange={(e) => setAccBonus(parseInt(e.target.value) || 0)} className="h-9 w-20" />
          </div>
          {!isStatus && dmgPool > 0 && (

            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs">Damage bonus dice</Label>
                <p className="text-[11px] text-muted-foreground">Pool: {dmgPool}d6 → rolling {Math.max(0, dmgPool + dmgBonus)}d6</p>
              </div>
              <Input type="number" value={dmgBonus} onChange={(e) => setDmgBonus(parseInt(e.target.value) || 0)} className="h-9 w-20" />
            </div>
          )}
          <Button onClick={confirm} className="w-full">
            <Dices className="mr-1.5 h-4 w-4" /> Roll
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

