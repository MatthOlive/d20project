export type BattleReaction = "none" | "clash" | "evade";

export type ReactionAvailability = {
  attackSuccesses: number;
  actionsAlreadyMade: number;
  actionNumber: number;
  minimumPool: number;
  clashPool: number;
  evadePool: number;
  canClash: boolean;
  canEvade: boolean;
};

export type ReactionOutcome = {
  choice: BattleReaction;
  pool: number;
  dice: number[];
  successes: number;
  succeeded: boolean;
  damageToAttacker: number;
  preventsMoveDamage: boolean;
};

type DiceRoll = { dice: number[]; successes: number };

export function reactionAvailability(
  attackSuccesses: number,
  clashPool: number,
  evadePool: number,
  actionsAlreadyMade = 0,
): ReactionAvailability {
  const required = Math.max(0, Math.trunc(attackSuccesses));
  const actions = Math.max(0, Math.trunc(actionsAlreadyMade));
  const actionNumber = actions + 1;
  const minimumPool = required + actionNumber;
  const clash = Math.max(0, Math.trunc(clashPool));
  const evade = Math.max(0, Math.trunc(evadePool));

  return {
    attackSuccesses: required,
    actionsAlreadyMade: actions,
    actionNumber,
    minimumPool,
    clashPool: clash,
    evadePool: evade,
    canClash: required > 0 && clash >= minimumPool,
    canEvade: required > 0 && evade >= minimumPool,
  };
}

export function resolveBattleReaction(
  availability: ReactionAvailability,
  choice: BattleReaction,
  roll: (pool: number) => DiceRoll,
): ReactionOutcome {
  const eligible = choice === "clash" ? availability.canClash : choice === "evade" ? availability.canEvade : false;
  const pool = choice === "clash" ? availability.clashPool : choice === "evade" ? availability.evadePool : 0;

  if (!eligible || choice === "none") {
    return {
      choice: "none",
      pool: 0,
      dice: [],
      successes: 0,
      succeeded: false,
      damageToAttacker: 0,
      preventsMoveDamage: false,
    };
  }

  const result = roll(pool);
  const succeeded = result.successes >= availability.attackSuccesses;
  return {
    choice,
    pool,
    dice: result.dice,
    successes: result.successes,
    succeeded,
    damageToAttacker: choice === "clash" && succeeded ? 1 : 0,
    preventsMoveDamage: succeeded,
  };
}

export function chooseNpcReaction(
  availability: ReactionAvailability,
  options: {
    difficulty: "easy" | "normal" | "hard";
    trainedByNpc: boolean;
    attackerHp: number;
    defenderHp: number;
    random?: () => number;
  },
): BattleReaction {
  const choices: BattleReaction[] = [];
  if (availability.canClash) choices.push("clash");
  if (availability.canEvade) choices.push("evade");
  if (choices.length === 0) return "none";

  const random = options.random ?? Math.random;
  const wildChance = options.difficulty === "easy" ? 0.2 : options.difficulty === "hard" ? 0.6 : 0.4;
  const reactionChance = Math.min(0.95, wildChance + (options.trainedByNpc ? 0.3 : 0));
  if (random() >= reactionChance) return "none";

  if (choices.length === 1) return choices[0];
  if (options.defenderHp <= 1) return "evade";
  if (options.attackerHp <= 1) return "clash";
  if (options.trainedByNpc) {
    return availability.evadePool >= availability.clashPool ? "evade" : "clash";
  }
  return random() < 0.65 ? "evade" : "clash";
}
