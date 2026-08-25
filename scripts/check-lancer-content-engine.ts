import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import { parseLcpFile } from "../src/lib/lancer/content";
import { recalculateLancerEntity } from "../src/lib/lancer/build-engine";
import { createEmptyLancerBuild, createInitialLancerState } from "../src/lib/lancer/rules-engine";
import type { LancerCompendiumItem } from "../src/lib/lancer/types";

const archive = zipSync({
  "manifest.json": strToU8(JSON.stringify({ id: "test-pack", name: "Test Pack", version: "1.0.0", author: "D20" })),
  "frames.json": strToU8(JSON.stringify([{ id: "test-frame", name: "Test Frame", stats: { hp: 10, armor: 0, size: 1, evasion: 8, e_defense: 8, speed: 4, heatcap: 6, repcap: 5, sensor_range: 10, save: 10, tech_attack: 0, sp: 6 }, mounts: ["Main", "Heavy"] }])),
  "mech_weapons.json": strToU8(JSON.stringify([{ id: "test-rifle", name: "Test Rifle", profiles: [{ name: "Test Rifle", range: [{ type: "Range", val: 10 }], damage: [{ type: "Kinetic", val: "1d6+2" }] }] }])),
});
const parsed = await parseLcpFile(new File([archive], "test.lcp"));
assert.equal(parsed.manifest.name, "Test Pack");
assert.equal(parsed.items.length, 2);
assert.equal(parsed.items[0].item_type, "frame");
assert.equal(parsed.items[1].action_definitions[0].damage[0].expression, "1d6+2");

const frame: LancerCompendiumItem = {
  id: "frame-row",
  game_id: "game",
  pack_id: "pack",
  item_type: "frame",
  external_id: "test-frame",
  name: "Test Frame",
  description: null,
  source_type: "lcp",
  source_name: "Test Pack",
  data: parsed.items[0].data,
  action_definitions: [],
  effect_definitions: [],
  trigger_definitions: [],
  enabled: true,
  created_at: "",
  updated_at: "",
};
const build = createEmptyLancerBuild();
build.frameId = frame.id;
build.mechSkills.hull = 2;
const result = recalculateLancerEntity(createInitialLancerState("mech"), build, [frame]);
assert.equal(result.state.resources.hp?.max, 14);
assert.equal(result.state.resources.repairs?.max, 6);
assert.equal(result.state.stats.evasion, 8);
assert.equal(result.state.stats.systemPoints, 6);
assert.equal(result.build.validation.valid, true);

console.log("LANCER content/build checks: 10 assertions passed");
