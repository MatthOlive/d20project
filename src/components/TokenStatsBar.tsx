import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Stat = {
  label: string;
  cur: number;
  max: number;
  color: string;
  onChange: (n: number) => void;
};

export function TokenStatsBar({
  kind, id, editable, expanded,
}: {
  kind: "trainer" | "pokemon";
  id: string;
  editable: boolean;
  expanded: boolean;
}) {
  if (kind === "trainer") return <TrainerStats id={id} editable={editable} expanded={expanded} />;
  return <PokemonStats id={id} editable={editable} expanded={expanded} />;
}

function TrainerStats({ id, editable, expanded }: { id: string; editable: boolean; expanded: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["token-trainer-stats", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainers")
        .select("attrs, attr_points, attr_bonus, current_hp, current_will, confidence, nature")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as {
        attrs: Record<string, number>;
        attr_points: Record<string, number>;
        attr_bonus: Record<string, number>;
        current_hp: number | null;
        current_will: number | null;
        confidence: number;
        nature: string | null;
      };
    },
  });
  const { data: natureMax } = useQuery({
    queryKey: ["nature-confidence", data?.nature ?? null],
    enabled: !!data?.nature,
    queryFn: async () => {
      const { data: n } = await supabase.from("natures").select("confidence").eq("name", data!.nature!).maybeSingle();
      return (n?.confidence as number | undefined) ?? null;
    },
  });
  if (!data) return null;
  const total = (k: string) => 1 + (data.attr_points?.[k] ?? 0) + (data.attr_bonus?.[k] ?? 0);
  const hpMax = 4 + total("vitality");
  const willMax = total("insight") + 2;
  const curHp = data.current_hp ?? hpMax;
  const curWill = data.current_will ?? willMax;
  const conf = data.confidence ?? 0;
  const confMax = natureMax ?? Math.max(conf, 5);

  async function patch(field: "current_hp" | "current_will" | "confidence", value: number) {
    qc.setQueryData(["token-trainer-stats", id], (old: typeof data) => old ? { ...old, [field]: value } : old);
    const upd = { [field]: value } as { current_hp?: number; current_will?: number; confidence?: number };
    const { error } = await supabase.from("trainers").update(upd).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["token-trainer", id] });
  }

  return (
    <StatsRow
      stats={[
        { label: "HP", cur: curHp, max: hpMax, color: "#22c55e", onChange: (n) => patch("current_hp", n) },
        { label: "Will", cur: curWill, max: willMax, color: "#3b82f6", onChange: (n) => patch("current_will", n) },
        { label: "Conf", cur: conf, max: confMax, color: "#ef4444", onChange: (n) => patch("confidence", n) },
      ]}
      editable={editable && expanded}
    />
  );
}

function PokemonStats({ id, editable, expanded }: { id: string; editable: boolean; expanded: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["token-pokemon-stats", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pokemon")
        .select("hp, will, current_hp, current_will, confidence, nature, current_attrs")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as {
        hp: number;
        will: number;
        current_hp: number | null;
        current_will: number | null;
        confidence: number;
        nature: string | null;
        current_attrs: Record<string, number>;
      };
    },
  });
  const { data: natureMax } = useQuery({
    queryKey: ["nature-confidence", data?.nature ?? null],
    enabled: !!data?.nature,
    queryFn: async () => {
      const { data: n } = await supabase.from("natures").select("confidence").eq("name", data!.nature!).maybeSingle();
      return (n?.confidence as number | undefined) ?? null;
    },
  });
  if (!data) return null;
  const hpMax = data.hp ?? 0;
  const willMax = data.will ?? ((data.current_attrs?.insight ?? 1) + 2);
  const curHp = data.current_hp ?? hpMax;
  const curWill = data.current_will ?? willMax;
  const conf = data.confidence ?? 0;
  const confMax = natureMax ?? Math.max(conf, 5);

  async function patch(field: "current_hp" | "current_will" | "confidence", value: number) {
    qc.setQueryData(["token-pokemon-stats", id], (old: typeof data) => old ? { ...old, [field]: value } : old);
    const upd = { [field]: value } as { current_hp?: number; current_will?: number; confidence?: number };
    const { error } = await supabase.from("pokemon").update(upd).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["token-pokemon", id] });
  }

  return (
    <StatsRow
      stats={[
        { label: "HP", cur: curHp, max: hpMax, color: "#22c55e", onChange: (n) => patch("current_hp", n) },
        { label: "Will", cur: curWill, max: willMax, color: "#3b82f6", onChange: (n) => patch("current_will", n) },
        { label: "Conf", cur: conf, max: confMax, color: "#ef4444", onChange: (n) => patch("confidence", n) },
      ]}
      editable={editable && expanded}
    />
  );
}

function StatsRow({ stats, editable }: { stats: Stat[]; editable: boolean }) {
  return (
    <div
      className="pointer-events-auto flex flex-col gap-1 rounded-md border border-border bg-card/95 px-2 py-1.5 shadow-md backdrop-blur"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      draggable={false}
    >
      {stats.map((s) => {
        const pct = Math.max(0, Math.min(100, (s.cur / s.max) * 100));
        return (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-8 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              {s.label}
            </span>
            <div className="h-3 w-20 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: s.color }}
              />
            </div>
            {editable ? (
              <input
                type="number"
                value={s.cur}
                onChange={(e) => s.onChange(parseInt(e.target.value) || 0)}
                className="h-5 w-10 rounded border border-border bg-background px-1 text-center text-[10px] font-bold tabular-nums"
              />
            ) : (
              <span className="text-[10px] font-bold tabular-nums">{s.cur}</span>
            )}
            <span className="text-[9px] text-muted-foreground tabular-nums">/{s.max}</span>
          </div>
        );
      })}
    </div>
  );
}
