import {
  ArrowUp,
  ArrowDown,
  Music2,
  Crosshair,
  RefreshCw,
  Zap,
  Heart,
  Skull,
  Flame,
  Snowflake,
  Moon,
  AlertTriangle,
  Shield,
  Star,
  Sparkles,
  Users,
  Wind,
  Ban,
  UserRound,
  UserRoundPlus,
  MapPin,
  Map,
  BatteryCharging,
  Hand,
  CloudSun,
  Dices,
  CircleCheck,
  CircleX,
  Swords,
} from "lucide-react";

/**
 * EffectIcons — visual chips representing a move/ability effect text,
 * inspired by the Pokérole 2.0 corebook iconography (Moves p.300+, Abilities p.450+).
 */

type Chip = { key: string; label: string; icon?: React.ReactNode; tone: string };

const STAT_KEYS = [
  "Strength",
  "Dexterity",
  "Vitality",
  "Special",
  "Insight",
  "Defense",
  "Sp.Def",
  "Sp. Def",
  "Special Defense",
  "Accuracy",
  "Evasion",
];

const STATUS_MAP: Record<string, { tone: string; icon: React.ReactNode }> = {
  poison: { tone: "bg-purple-600 text-white", icon: <Skull className="h-3 w-3" /> },
  burn: { tone: "bg-orange-600 text-white", icon: <Flame className="h-3 w-3" /> },
  frozen: { tone: "bg-sky-500 text-white", icon: <Snowflake className="h-3 w-3" /> },
  freeze: { tone: "bg-sky-500 text-white", icon: <Snowflake className="h-3 w-3" /> },
  sleep: { tone: "bg-indigo-500 text-white", icon: <Moon className="h-3 w-3" /> },
  paralysis: { tone: "bg-yellow-500 text-black", icon: <Zap className="h-3 w-3" /> },
  paralyze: { tone: "bg-yellow-500 text-black", icon: <Zap className="h-3 w-3" /> },
  flinch: { tone: "bg-rose-500 text-white", icon: <AlertTriangle className="h-3 w-3" /> },
  confused: { tone: "bg-fuchsia-500 text-white", icon: <Sparkles className="h-3 w-3" /> },
  confusion: { tone: "bg-fuchsia-500 text-white", icon: <Sparkles className="h-3 w-3" /> },
  infatuated: { tone: "bg-pink-500 text-white", icon: <Heart className="h-3 w-3" /> },
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
    const dec =
      new RegExp(`reduce[^.]*?${s.replace(".", "\\.")}`, "i").test(text) ||
      new RegExp(`lower[^.]*?${s.replace(".", "\\.")}`, "i").test(text);
    // amount: try to find "<stat> + N" or "−N"
    const amtMatch = new RegExp(`${s.replace(".", "\\.")}[^.]*?([+-]?\\d)`).exec(lower);
    const amt = amtMatch ? amtMatch[1].replace("+", "") : "1";
    if (inc)
      chips.push({
        key: `inc-${s}`,
        label: `${stat} +${amt}`,
        icon: <ArrowUp className="h-3 w-3" />,
        tone: statTone(true),
      });
    if (dec)
      chips.push({
        key: `dec-${s}`,
        label: `${stat} -${amt}`,
        icon: <ArrowDown className="h-3 w-3" />,
        tone: statTone(false),
      });
  }
}

const TARGET_CHIPS: Record<string, { label: string; tone: string; icon: React.ReactNode }> = {
  user: {
    label: "User",
    tone: "bg-emerald-700 text-white",
    icon: <UserRound className="h-3 w-3" />,
  },
  "one ally": {
    label: "One Ally",
    tone: "bg-emerald-700 text-white",
    icon: <UserRoundPlus className="h-3 w-3" />,
  },
  "user and allies": {
    label: "User + Allies",
    tone: "bg-emerald-700 text-white",
    icon: <Users className="h-3 w-3" />,
  },
  foe: { label: "Foe", tone: "bg-red-700 text-white", icon: <Crosshair className="h-3 w-3" /> },
  "random foe": {
    label: "Random Foe",
    tone: "bg-red-700 text-white",
    icon: <Dices className="h-3 w-3" />,
  },
  "all foes": {
    label: "All Foes",
    tone: "bg-red-700 text-white",
    icon: <Users className="h-3 w-3" />,
  },
  area: { label: "Area", tone: "bg-orange-600 text-white", icon: <MapPin className="h-3 w-3" /> },
  battlefield: {
    label: "Battlefield",
    tone: "bg-stone-600 text-white",
    icon: <Map className="h-3 w-3" />,
  },
  "battlefield and area": {
    label: "Field + Area",
    tone: "bg-stone-600 text-white",
    icon: <Map className="h-3 w-3" />,
  },
  any: {
    label: "Any Target",
    tone: "bg-stone-600 text-white",
    icon: <Crosshair className="h-3 w-3" />,
  },
};

function addEffectChip(
  chips: Chip[],
  key: string,
  label: string,
  tone: string,
  icon: React.ReactNode,
) {
  chips.push({ key, label, tone, icon });
}

function parseEffectChips(
  effect: string | null | undefined,
  category?: string | null,
  target?: string | null,
): Chip[] {
  const text = effect ?? "";
  const lower = text.toLowerCase();
  const chips: Chip[] = [];

  const categoryKey = category?.toLowerCase().trim();
  if (categoryKey === "physical") {
    addEffectChip(
      chips,
      "category-physical",
      "Physical",
      "bg-amber-600 text-white",
      <Swords className="h-3 w-3" />,
    );
  } else if (categoryKey === "special") {
    addEffectChip(
      chips,
      "category-special",
      "Special",
      "bg-blue-700 text-white",
      <Sparkles className="h-3 w-3" />,
    );
  } else if (categoryKey === "support" || categoryKey === "status") {
    addEffectChip(
      chips,
      "category-support",
      "Support",
      "bg-slate-600 text-white",
      <Shield className="h-3 w-3" />,
    );
  }

  const normalizedTarget = target?.toLowerCase().trim();
  const inferredTarget =
    normalizedTarget && TARGET_CHIPS[normalizedTarget]
      ? normalizedTarget
      : /all foes|target all foes/i.test(text)
        ? "all foes"
        : /random foe/i.test(text)
          ? "random foe"
          : /one ally|an ally|ally target/i.test(text)
            ? "one ally"
            : /user and allies|user & all allies/i.test(text)
              ? "user and allies"
              : /battlefield/i.test(text)
                ? "battlefield"
                : /area attack|area\b/i.test(text)
                  ? "area"
                  : text
                    ? "foe"
                    : "";
  const targetChip = TARGET_CHIPS[inferredTarget];
  if (targetChip)
    addEffectChip(
      chips,
      `target-${inferredTarget}`,
      targetChip.label,
      targetChip.tone,
      targetChip.icon,
    );

  parseStatChanges(text, chips);

  for (const [key, conf] of Object.entries(STATUS_MAP)) {
    if (new RegExp(`\\b${key}\\b`, "i").test(text)) {
      chips.push({
        key: `st-${key}`,
        label: key[0].toUpperCase() + key.slice(1),
        tone: conf.tone,
        icon: conf.icon,
      });
    }
  }

  const chanceDice = [...text.matchAll(/roll\s+(\d+)\s+chance\s+dice?/gi)];
  for (const [index, match] of chanceDice.entries()) {
    addEffectChip(
      chips,
      `chance-${index}-${match[1]}`,
      `Chance ×${match[1]}`,
      "bg-slate-600 text-white",
      <Dices className="h-3 w-3" />,
    );
  }
  if (/always affected|will always be affected/i.test(text))
    addEffectChip(
      chips,
      "always-affected",
      "Always Affected",
      "bg-emerald-700 text-white",
      <CircleCheck className="h-3 w-3" />,
    );
  if (/never affected|will never be affected/i.test(text))
    addEffectChip(
      chips,
      "never-affected",
      "Never Affected",
      "bg-red-700 text-white",
      <CircleX className="h-3 w-3" />,
    );
  if (/sound[- ]based/i.test(text))
    addEffectChip(
      chips,
      "sound",
      "Sound",
      "bg-slate-700 text-white",
      <Music2 className="h-3 w-3" />,
    );
  if (/\branged\b/i.test(text))
    addEffectChip(
      chips,
      "ranged",
      "Ranged",
      "bg-cyan-700 text-white",
      <Crosshair className="h-3 w-3" />,
    );
  if (/switch(?:es|er)? out|switcher move/i.test(text))
    addEffectChip(
      chips,
      "switch",
      "Switcher",
      "bg-emerald-700 text-white",
      <RefreshCw className="h-3 w-3" />,
    );
  if (/\bcharge(?:d|s|ing)?\b/i.test(text))
    addEffectChip(
      chips,
      "charge",
      "Charge",
      "bg-amber-600 text-white",
      <Zap className="h-3 w-3" />,
    );
  if (/fist based|punch(?:es|ing)?/i.test(text))
    addEffectChip(
      chips,
      "fist",
      "Fist Based",
      "bg-yellow-600 text-white",
      <Hand className="h-3 w-3" />,
    );
  if (/\bheal|recover|restore/i.test(text))
    addEffectChip(chips, "heal", "Heal", "bg-rose-600 text-white", <Heart className="h-3 w-3" />);
  if (/entry hazard|stealth rock|spike|sticky web/i.test(text))
    chips.push({
      key: "hazard",
      label: "Hazard",
      tone: "bg-stone-700 text-white",
      icon: <AlertTriangle className="h-3 w-3" />,
    });
  if (/high critical|high crit|critical hit/i.test(text))
    addEffectChip(
      chips,
      "crit",
      "High Crit",
      "bg-yellow-600 text-white",
      <Star className="h-3 w-3" />,
    );
  if (/\blethal\b/i.test(text))
    addEffectChip(
      chips,
      "lethal",
      "Lethal",
      "bg-red-800 text-white",
      <Skull className="h-3 w-3" />,
    );
  if (/must recharge|recharge on|rest with its first action/i.test(text))
    addEffectChip(
      chips,
      "recharge",
      "Recharge",
      "bg-zinc-800 text-white",
      <BatteryCharging className="h-3 w-3" />,
    );
  if (/never fails|never fail|cannot be evaded/i.test(text))
    addEffectChip(
      chips,
      "never-fail",
      "Never Fail",
      "bg-yellow-400 text-black",
      <Star className="h-3 w-3" />,
    );
  if (/low priority/i.test(text))
    addEffectChip(
      chips,
      "low-priority",
      "Low Priority",
      "bg-emerald-700 text-white",
      <ArrowDown className="h-3 w-3" />,
    );
  else if (/\bpriority\b/i.test(text))
    addEffectChip(
      chips,
      "priority",
      "Priority",
      "bg-emerald-700 text-white",
      <ArrowUp className="h-3 w-3" />,
    );
  if (/rampage|up to 3 times without interruption/i.test(text))
    addEffectChip(
      chips,
      "rampage",
      "Rampage",
      "bg-rose-700 text-white",
      <Flame className="h-3 w-3" />,
    );
  if (/\brecoil\b|hurt by its own move/i.test(text))
    addEffectChip(
      chips,
      "recoil",
      "Recoil",
      "bg-orange-700 text-white",
      <Zap className="h-3 w-3" />,
    );
  if (/shield move|\bshield\b|\bprotect\b|\bguard\b/i.test(lower))
    addEffectChip(
      chips,
      "protect",
      "Shield",
      "bg-blue-700 text-white",
      <Shield className="h-3 w-3" />,
    );
  if (/successive actions|double action|multiple actions/i.test(text))
    addEffectChip(
      chips,
      "successive",
      "Successive",
      "bg-amber-800 text-white",
      <Dices className="h-3 w-3" />,
    );
  if (/weather|sunny|rainy|snowy|sandstorm|windy/i.test(text))
    addEffectChip(
      chips,
      "weather",
      "Weather",
      "bg-sky-700 text-white",
      <CloudSun className="h-3 w-3" />,
    );
  if (/\bblocks?\b|cannot escape|can’t escape|can't be switched/i.test(text))
    addEffectChip(chips, "block", "Block", "bg-zinc-700 text-white", <Ban className="h-3 w-3" />);
  const damageBonus = text.match(/(?:add|increase)\s+(\d+)\s+extra dice[^.]*damage/i);
  if (damageBonus)
    addEffectChip(
      chips,
      "damage-bonus",
      `Damage +${damageBonus[1]}`,
      "bg-blue-700 text-white",
      <ArrowUp className="h-3 w-3" />,
    );
  const damageReduction = text.match(/reduce\s+(\d+)\s+damage/i);
  if (damageReduction)
    addEffectChip(
      chips,
      "damage-reduction",
      `Damage −${damageReduction[1]}`,
      "bg-blue-700 text-white",
      <ArrowDown className="h-3 w-3" />,
    );
  if (/reduce.*accuracy|accuracy\s*[-−]\s*\d+/i.test(text))
    addEffectChip(
      chips,
      "accuracy-down",
      "Accuracy Reduced",
      "bg-red-700 text-white",
      <ArrowDown className="h-3 w-3" />,
    );
  if (/wind|gust/i.test(lower))
    chips.push({
      key: "wind",
      label: "Wind",
      tone: "bg-teal-600 text-white",
      icon: <Wind className="h-3 w-3" />,
    });

  // dedupe
  const seen = new Set<string>();
  return chips.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
}

export function EffectIcons({
  effect,
  category,
  target,
  className = "",
}: {
  effect: string | null | undefined;
  category?: string | null;
  target?: string | null;
  className?: string;
}) {
  const chips = parseEffectChips(effect, category, target);
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
