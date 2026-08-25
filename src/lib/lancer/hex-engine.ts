export type HexCoord = { q: number; r: number };

export type HexPixel = { x: number; y: number };

export type LancerHexTerrainType =
  | "normal"
  | "difficult"
  | "dangerous"
  | "obstruction"
  | "cover"
  | "custom";

export type LancerHexCell = HexCoord & {
  terrainType: LancerHexTerrainType;
  movementCost: number;
  blocksMovement: boolean;
  blocksLos: boolean;
  cover: 0 | 1 | 2;
};

export type HexMapBounds = {
  qMin: number;
  qMax: number;
  rMin: number;
  rMax: number;
};

export type HexPathOptions = {
  bounds?: HexMapBounds;
  cells?: ReadonlyMap<string, LancerHexCell>;
  occupied?: ReadonlySet<string>;
  allowOccupiedDestination?: boolean;
  maximumCost?: number;
};

export type HexPathResult = {
  path: HexCoord[];
  cost: number;
};

export type HexReachableResult = {
  costs: Map<string, number>;
  previous: Map<string, string>;
};

export type LancerLineOfSightAnalysis = {
  hasLineOfSight: boolean;
  cover: 0 | 1 | 2;
  difficulty: number;
  traversed: HexCoord[];
  blockingHex: HexCoord | null;
};

const DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexNeighbors(coord: HexCoord): HexCoord[] {
  return DIRECTIONS.map((direction) => hexAdd(coord, direction));
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -a.q - a.r - (-b.q - b.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

export function isHexInBounds(coord: HexCoord, bounds?: HexMapBounds): boolean {
  if (!bounds) return true;
  return coord.q >= bounds.qMin && coord.q <= bounds.qMax
    && coord.r >= bounds.rMin && coord.r <= bounds.rMax;
}

export function axialToPixel(coord: HexCoord, size: number): HexPixel {
  return {
    x: size * Math.sqrt(3) * (coord.q + coord.r / 2),
    y: size * 1.5 * coord.r,
  };
}

export function roundFractionalHex(q: number, r: number): HexCoord {
  const s = -q - r;
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  let roundedS = Math.round(s);
  const qDiff = Math.abs(roundedQ - q);
  const rDiff = Math.abs(roundedR - r);
  const sDiff = Math.abs(roundedS - s);

  if (qDiff > rDiff && qDiff > sDiff) roundedQ = -roundedR - roundedS;
  else if (rDiff > sDiff) roundedR = -roundedQ - roundedS;
  else roundedS = -roundedQ - roundedR;

  return { q: roundedQ, r: roundedR };
}

export function pixelToAxial(pixel: HexPixel, size: number): HexCoord {
  const q = (Math.sqrt(3) / 3 * pixel.x - pixel.y / 3) / size;
  const r = (2 / 3 * pixel.y) / size;
  return roundFractionalHex(q, r);
}

function cubeLerp(a: HexCoord, b: HexCoord, t: number): { q: number; r: number } {
  return {
    q: a.q + (b.q - a.q) * t,
    r: a.r + (b.r - a.r) * t,
  };
}

export function hexLine(a: HexCoord, b: HexCoord): HexCoord[] {
  const distance = hexDistance(a, b);
  if (distance === 0) return [{ ...a }];
  return Array.from({ length: distance + 1 }, (_, index) => {
    const point = cubeLerp(a, b, index / distance);
    return roundFractionalHex(point.q, point.r);
  });
}

export function hexRange(center: HexCoord, radius: number): HexCoord[] {
  const safeRadius = Math.max(0, Math.trunc(radius));
  const result: HexCoord[] = [];
  for (let q = -safeRadius; q <= safeRadius; q += 1) {
    const rMin = Math.max(-safeRadius, -q - safeRadius);
    const rMax = Math.min(safeRadius, -q + safeRadius);
    for (let r = rMin; r <= rMax; r += 1) {
      result.push({ q: center.q + q, r: center.r + r });
    }
  }
  return result;
}

export function hexRing(center: HexCoord, radius: number): HexCoord[] {
  const safeRadius = Math.max(0, Math.trunc(radius));
  if (safeRadius === 0) return [{ ...center }];
  return hexRange(center, safeRadius).filter((coord) => hexDistance(center, coord) === safeRadius);
}

export function blastArea(center: HexCoord, radius: number): HexCoord[] {
  return hexRange(center, radius);
}

export function burstArea(center: HexCoord, radius: number): HexCoord[] {
  return hexRange(center, radius).filter((coord) => !hexEquals(coord, center));
}

export function lineArea(origin: HexCoord, target: HexCoord, length: number): HexCoord[] {
  const safeLength = Math.max(0, Math.trunc(length));
  if (safeLength === 0 || hexEquals(origin, target)) return [];
  const targetDistance = hexDistance(origin, target);
  const scale = safeLength / targetDistance;
  const endpoint = roundFractionalHex(
    origin.q + (target.q - origin.q) * scale,
    origin.r + (target.r - origin.r) * scale,
  );
  return hexLine(origin, endpoint).slice(1, safeLength + 1);
}

export function coneArea(origin: HexCoord, target: HexCoord, length: number): HexCoord[] {
  const centerLine = lineArea(origin, target, length);
  const result = new Map<string, HexCoord>();
  for (const center of centerLine) {
    const distance = hexDistance(origin, center);
    const width = Math.max(0, Math.floor((distance - 1) / 2));
    for (const coord of hexRange(center, width)) {
      if (hexDistance(origin, coord) <= length) result.set(hexKey(coord), coord);
    }
  }
  return [...result.values()];
}

function movementCost(coord: HexCoord, cells?: ReadonlyMap<string, LancerHexCell>): number {
  const cell = cells?.get(hexKey(coord));
  return Math.max(1, Number.isFinite(cell?.movementCost) ? Number(cell?.movementCost) : 1);
}

function isBlocked(
  coord: HexCoord,
  destination: HexCoord,
  options: HexPathOptions,
): boolean {
  const key = hexKey(coord);
  if (!isHexInBounds(coord, options.bounds)) return true;
  if (options.cells?.get(key)?.blocksMovement) return true;
  if (options.occupied?.has(key)) {
    return !(options.allowOccupiedDestination && hexEquals(coord, destination));
  }
  return false;
}

function reconstructPath(previous: Map<string, string>, start: HexCoord, goal: HexCoord): HexCoord[] {
  const result: HexCoord[] = [{ ...goal }];
  let current = hexKey(goal);
  const startKey = hexKey(start);
  while (current !== startKey) {
    const parent = previous.get(current);
    if (!parent) return [];
    result.push(parseHexKey(parent));
    current = parent;
  }
  return result.reverse();
}

export function findHexPath(
  start: HexCoord,
  goal: HexCoord,
  options: HexPathOptions = {},
): HexPathResult | null {
  if (hexEquals(start, goal)) return { path: [{ ...start }], cost: 0 };
  if (isBlocked(goal, goal, options)) return null;

  const startKey = hexKey(start);
  const goalKey = hexKey(goal);
  const open = new Set<string>([startKey]);
  const scores = new Map<string, number>([[startKey, 0]]);
  const estimates = new Map<string, number>([[startKey, hexDistance(start, goal)]]);
  const previous = new Map<string, string>();

  while (open.size > 0) {
    let currentKey = "";
    let currentEstimate = Number.POSITIVE_INFINITY;
    for (const key of open) {
      const estimate = estimates.get(key) ?? Number.POSITIVE_INFINITY;
      if (estimate < currentEstimate) {
        currentEstimate = estimate;
        currentKey = key;
      }
    }
    if (!currentKey) break;
    if (currentKey === goalKey) {
      const cost = scores.get(goalKey) ?? 0;
      if (options.maximumCost !== undefined && cost > options.maximumCost) return null;
      return { path: reconstructPath(previous, start, goal), cost };
    }

    open.delete(currentKey);
    const current = parseHexKey(currentKey);
    const currentScore = scores.get(currentKey) ?? Number.POSITIVE_INFINITY;
    for (const neighbor of hexNeighbors(current)) {
      if (isBlocked(neighbor, goal, options)) continue;
      const candidateScore = currentScore + movementCost(neighbor, options.cells);
      if (options.maximumCost !== undefined && candidateScore > options.maximumCost) continue;
      const neighborKey = hexKey(neighbor);
      if (candidateScore >= (scores.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
      previous.set(neighborKey, currentKey);
      scores.set(neighborKey, candidateScore);
      estimates.set(neighborKey, candidateScore + hexDistance(neighbor, goal));
      open.add(neighborKey);
    }
  }
  return null;
}

export function reachableHexes(
  start: HexCoord,
  movement: number,
  options: Omit<HexPathOptions, "maximumCost" | "allowOccupiedDestination"> = {},
): HexReachableResult {
  const maximumCost = Math.max(0, movement);
  const startKey = hexKey(start);
  const costs = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string>();
  const frontier = new Set<string>([startKey]);

  while (frontier.size > 0) {
    let currentKey = "";
    let currentCost = Number.POSITIVE_INFINITY;
    for (const key of frontier) {
      const cost = costs.get(key) ?? Number.POSITIVE_INFINITY;
      if (cost < currentCost) {
        currentCost = cost;
        currentKey = key;
      }
    }
    if (!currentKey) break;
    frontier.delete(currentKey);
    const current = parseHexKey(currentKey);
    for (const neighbor of hexNeighbors(current)) {
      if (isBlocked(neighbor, neighbor, options)) continue;
      const nextCost = currentCost + movementCost(neighbor, options.cells);
      if (nextCost > maximumCost) continue;
      const neighborKey = hexKey(neighbor);
      if (nextCost >= (costs.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
      costs.set(neighborKey, nextCost);
      previous.set(neighborKey, currentKey);
      frontier.add(neighborKey);
    }
  }

  return { costs, previous };
}

export function hasHexLineOfSight(
  origin: HexCoord,
  target: HexCoord,
  cells?: ReadonlyMap<string, LancerHexCell>,
): boolean {
  const line = hexLine(origin, target);
  return line.slice(1, -1).every((coord) => !cells?.get(hexKey(coord))?.blocksLos);
}

export function analyzeHexLineOfSight(
  origin: HexCoord,
  target: HexCoord,
  cells?: ReadonlyMap<string, LancerHexCell>,
): LancerLineOfSightAnalysis {
  const traversed = hexLine(origin, target);
  const intervening = traversed.slice(1, -1);
  const blockingHex = intervening.find((coord) => cells?.get(hexKey(coord))?.blocksLos) ?? null;
  const cover = intervening.reduce<0 | 1 | 2>((maximum, coord) => {
    const value = cells?.get(hexKey(coord))?.cover ?? 0;
    return Math.max(maximum, value) as 0 | 1 | 2;
  }, cells?.get(hexKey(target))?.cover ?? 0);
  return {
    hasLineOfSight: !blockingHex,
    cover,
    difficulty: cover > 0 ? 1 : 0,
    traversed,
    blockingHex,
  };
}

export function occupiedHexes(origin: HexCoord, size: number): HexCoord[] {
  const radius = Math.max(0, Math.ceil(size) - 1);
  return hexRange(origin, radius);
}
