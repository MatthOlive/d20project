import {
  axialToPixel,
  blastArea,
  coneArea,
  findHexPath,
  hasHexLineOfSight,
  hexDistance,
  hexKey,
  hexLine,
  pixelToAxial,
  reachableHexes,
  type LancerHexCell,
} from "../src/lib/lancer/hex-engine.ts";

let assertions = 0;
function check(condition: unknown, message: string): void {
  assertions += 1;
  if (!condition) throw new Error(message);
}

check(hexDistance({ q: 0, r: 0 }, { q: 3, r: -2 }) === 3, "hex distance");
check(hexLine({ q: 0, r: 0 }, { q: 3, r: -2 }).length === 4, "hex line length");

const pixel = axialToPixel({ q: -4, r: 7 }, 32);
const roundTrip = pixelToAxial(pixel, 32);
check(roundTrip.q === -4 && roundTrip.r === 7, "pixel conversion round trip");
check(blastArea({ q: 0, r: 0 }, 2).length === 19, "blast radius 2");
check(coneArea({ q: 0, r: 0 }, { q: 1, r: 0 }, 4).length > 4, "cone widens");

const obstruction: LancerHexCell = {
  q: 1,
  r: 0,
  terrainType: "obstruction",
  movementCost: 1,
  blocksMovement: true,
  blocksLos: true,
  cover: 2,
};
const difficult: LancerHexCell = {
  q: 0,
  r: 1,
  terrainType: "difficult",
  movementCost: 2,
  blocksMovement: false,
  blocksLos: false,
  cover: 0,
};
const cells = new Map([
  [hexKey(obstruction), obstruction],
  [hexKey(difficult), difficult],
]);
const bounds = { qMin: -5, qMax: 5, rMin: -5, rMax: 5 };
const path = findHexPath({ q: 0, r: 0 }, { q: 2, r: 0 }, { cells, bounds });
check(!!path && path.path.every((coord) => hexKey(coord) !== "1,0"), "path avoids obstruction");
check(!!path && path.cost === 3, "path accounts for detour");
check(!hasHexLineOfSight({ q: 0, r: 0 }, { q: 2, r: 0 }, cells), "obstruction blocks LOS");
check(hasHexLineOfSight({ q: 0, r: 0 }, { q: 0, r: 2 }, cells), "clear LOS");

const reachable = reachableHexes({ q: 0, r: 0 }, 1, { cells, bounds });
check(!reachable.costs.has("0,1"), "difficult terrain exceeds movement one");
check(!reachable.costs.has("1,0"), "blocked terrain is unreachable");

console.log(`LANCER hex checks: ${assertions} assertions passed`);
