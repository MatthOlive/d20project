import {
  ArrowUp, ArrowDown, Music2, Crosshair, RefreshCw, Zap, Heart, Skull,
  Flame, Snowflake, Moon, AlertTriangle, Shield, Star, Sparkles, Users,
  Wind, Ban,
} from "lucide-react";

/**
 * EffectIcons — visual chips representing a move/ability effect text,
 * inspired by the Pokérole 2.0 corebook iconography (Moves p.300+, Abilities p.450+).
 */

type Chip = { key: string; label: string; icon?: React.ReactNode; tone: string };

const STAT_KEYS = [
  "Strength", "Dexterity", "Vitality", "Special", "Insight",
  "Defense", "Sp.Def", "Sp. Def", "Special Defense", "Accuracy", "Evasion",
];

const STATUS_MAP: Record<string, { tone: string; icon: React.ReactNode }> = {
  poison:     { tone: "bg-purple-600 text-white",   icon: <Skull className="h-3 w-3" /> },
  burn:       { tone: "bg-orange-600 text-white",   icon: <Flame className="h-3 w-3" /> },
  frozen:     { tone: "bg-sky-500 text-white",      icon: <Snowflake className="h-3 w-3" /> },
  freeze:     { tone: "bg-sky-500 text-white",      icon: <Snowflake className="h-3 w-3" /> },
  sleep:      { tone: "bg-indigo-500 text-white",   icon: <Moon className="h-3 w-3" /> },
  paralysis:  { tone: "bg-yellow-500 text-black",   icon: <Zap className="h-3 w-3" /> },
  paralyze:   { tone: "bg-yellow-500 text-black",   icon: <Zap className="h-3 w-3" /> },
  flinch:     { tone: "bg-rose-500 text-white",     icon: <AlertTriangle className="h-3 w-3" /> },
  confused:   { tone: "bg-fuchsia-500 text-white",  icon: <Sparkles className="h-3 w-3" /> },
  confusion:  { tone: "bg-fuchsia-500 text-white",  icon: <Sparkles className="h-3 w-3" /> },
  infatuated: { tone: "bg-pink-500 text-white",     icon: <Heart className="h-3 w-3" /> },
};

function statTone(up: boolean) {
  return up ? "bg-emerald-600 text-white" : "bg-red-600 text-white";
}

function parseStatChanges(text: string, chips: Chip[]) {
  // matches "Increase the User's Strength", "Reduce the foe's Defense" etc.
  const lower = text.toLowerCase();
  for (const stat of STAT_KEYS) {
    const s = stat.toLowerCase();
    const inc = new RegExp(`increase[^.]*?${s.replace(".", "\\.")}`, "i").test(text);
    const dec = new RegExp(`reduce[^.]*?${s.replace(".", "\\.")}`, "i").test(text)
             || new RegExp(`lower[^.]*?${s.replace(".", "\\.")}`, "i").test(text);
    // amount: try to find "<stat> + N" or "−N"
    const amtMatch = new RegExp(`${s.replace(".", "\\.")}[^.]*?([+-]?\\d)`).exec(lower);
    const amt = amtMatch ? amtMatch[1].replace("+", "") : "1";
    if (inc) chips.push({
      key: `inc-${s}`, label: `${stat} +${amt}`,
      icon: <ArrowUp className="h-3 w-3" />, tone: statTone(true),
    });
    if (dec) chips.push({
      key: `dec-${s}`, label: `${stat} -${amt}`,
      icon: <ArrowDown className="h-3 w-3" />, tone: statTone(false),
    });
  }
}

export function parseEffectChips(effect: string | null | undefined): Chip[] {
  if (!effect) return [];
  const text = effect;
  const lower = text.toLowerCase();
  const chips: Chip[] = [];

  parseStatChanges(text, chips);

  for (const [key, conf] of Object.entries(STATUS_MAP)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(text)) {
      chips.push({ key: `st-${key}`, label: key[0].toUpperCase() + key.slice(1), tone: conf.tone, icon: conf.icon });
    }
  }

  if (/sound[- ]based/i.test(text)) chips.push({ key: "sound", label: "Sound", tone: "bg-slate-700 text-white", icon: <Music2 className="h-3 w-3" /> });
  if (/\branged\b/i.test(text))     chips.push({ key: "ranged", label: "Ranged", tone: "bg-cyan-700 text-white", icon: <Crosshair className="h-3 w-3" /> });
  if (/switch(es|er)/i.test(text))  chips.push({ key: "switch", label: "Switcher", tone: "bg-emerald-700 text-white", icon: <RefreshCw className="h-3 w-3" /> });
  if (/\bcharge\b/i.test(text))     chips.push({ key: "charge", label: "Charge", tone: "bg-amber-600 text-white", icon: <Zap className="h-3 w-3" /> });
  if (/\bheal|recover|restore/i.test(text)) chips.push({ key: "heal", label: "Heal", tone: "bg-rose-600 text-white", icon: <Heart className="h-3 w-3" /> });
  if (/all foes|target all|every foe/i.test(text)) chips.push({ key: "all", label: "All Foes", tone: "bg-red-700 text-white", icon: <Users className="h-3 w-3" /> });
  if (/entry hazard|stealth rock|spike|sticky web/i.test(text)) chips.push({ key: "hazard", label: "Hazard", tone: "bg-stone-700 text-white", icon: <AlertTriangle className="h-3 w-3" /> });
  if (/critical hit/i.test(text))   chips.push({ key: "crit", label: "Crit", tone: "bg-yellow-600 text-white", icon: <Star className="h-3 w-3" /> });
  if (/block|prevent/i.test(text))  chips.push({ key: "block", label: "Block", tone: "bg-zinc-700 text-white", icon: <Ban className="h-3 w-3" /> });
  if (/protect|shield|guard/i.test(lower)) chips.push({ key: "protect", label: "Protect", tone: "bg-blue-700 text-white", icon: <Shield className="h-3 w-3" /> });
  if (/wind|gust/i.test(lower))     chips.push({ key: "wind", label: "Wind", tone: "bg-teal-600 text-white", icon: <Wind className="h-3 w-3" /> });

  // dedupe
  const seen = new Set<string>();
  return chips.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
}

export function EffectIcons({ effect, className = "" }: { effect: string | null | undefined; className?: string }) {
  const chips = parseEffectChips(effect);
  if (chips.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {chips.map((c) => (
        <span
          key={c.key}
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm ${c.tone}`}
          title={c.label}
        >
          {c.icon}
          {c.label}
        </span>
      ))}
    </div>
  );
}
