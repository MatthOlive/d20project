export type MoveAccuracyOutcome = {
  requiredSuccesses: number;
  criticalSuccesses: number;
  isHit: boolean;
  isCritical: boolean;
};

function nonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function resolveMoveAccuracy(
  successes: number,
  actionsAlreadyMade: number,
  criticalMargin: number,
): MoveAccuracyOutcome {
  const actions = nonNegativeInteger(actionsAlreadyMade);
  const margin = nonNegativeInteger(criticalMargin);
  const rolledSuccesses = nonNegativeInteger(successes);
  const requiredSuccesses = actions + 1;
  const criticalSuccesses = requiredSuccesses + Math.max(0, 3 - margin);
  const isHit = rolledSuccesses >= requiredSuccesses;

  return {
    requiredSuccesses,
    criticalSuccesses,
    isHit,
    isCritical: isHit && rolledSuccesses >= criticalSuccesses,
  };
}

export function shouldRollMoveDamage(isHit: boolean, isStatus: boolean, damagePool: number): boolean {
  return isHit && !isStatus && damagePool > 0;
}

export function shouldRollMoveSecondaryEffects(isHit: boolean): boolean {
  return isHit;
}

type DamageTarget = {
  requestId?: string;
  immune: boolean;
  finalDamage: number;
};

type DamageReaction = {
  requestId: string;
  choice: "none" | "clash" | "evade";
  succeeded: boolean;
};

export function adjustedDamageTargets<T extends DamageTarget>(
  targets: T[] | undefined,
  responses: DamageReaction[],
): T[] | undefined {
  if (!targets) return undefined;
  const byRequest = new Map(responses.map((response) => [response.requestId, response]));
  return targets.map((target) => {
    const response = target.requestId ? byRequest.get(target.requestId) : null;
    if (target.immune) return { ...target, finalDamage: 0 };
    if (!response?.succeeded) return { ...target, finalDamage: Math.max(1, target.finalDamage) };
    if (response.choice === "evade") return { ...target, finalDamage: 0 };
    if (response.choice === "clash") return { ...target, finalDamage: 1 };
    return { ...target, finalDamage: Math.max(1, target.finalDamage) };
  });
}
