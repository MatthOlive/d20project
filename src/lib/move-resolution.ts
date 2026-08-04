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
