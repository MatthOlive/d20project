import {
  composeLancerNpc,
  evaluateLancerObjective,
  parseLancerDeploymentHexes,
  validateLancerEncounter,
} from "../src/lib/lancer/gm-engine.ts";
import type { LancerCompendiumItem, LancerEncounterObjective } from "../src/lib/lancer/types.ts";

let assertions = 0;
function check(condition: unknown, message: string): void {
  assertions += 1;
  if (!condition) throw new Error(message);
}

function item(input: Partial<LancerCompendiumItem> & Pick<LancerCompendiumItem, "id" | "item_type" | "name">): LancerCompendiumItem {
  return {
    game_id: null,
    pack_id: null,
    external_id: input.id,
    description: null,
    source_type: "core",
    source_name: "Core",
    data: {},
    action_definitions: [],
    effect_definitions: [],
    trigger_definitions: [],
    enabled: true,
    created_at: "2026-08-23T00:00:00Z",
    updated_at: "2026-08-23T00:00:00Z",
    ...input,
  };
}

const assault = item({
  id: "class-assault",
  item_type: "npc_class",
  name: "Assault",
  data: {
    stats: {
      hp: [12, 15, 18],
      armor: 1,
      evasion: [8, 10, 12],
      e_defense: [7, 9, 11],
      speed: 4,
      heatcap: [6, 8, 10],
      save: [11, 13, 15],
    },
  },
  action_definitions: [{
    id: "assault-rifle",
    name: "Assault Rifle",
    sourceId: "class-assault",
    activation: "quick",
    attackType: "ranged",
    targetType: "character",
    range: [{ type: "range", value: 10 }],
    roll: "1d20",
    damage: [{ type: "kinetic", expression: "4" }],
    effects: [],
    resourceCosts: {},
    triggers: [],
  }],
});
const veteran = item({
  id: "template-veteran",
  item_type: "npc_template",
  name: "Veteran",
  effect_definitions: [{ id: "veteran-armor", kind: "stat_bonus", target: "armor", value: 1 }],
});
const grenade = item({
  id: "feature-grenade",
  item_type: "npc_feature",
  name: "Grenade",
  action_definitions: [{
    id: "grenade",
    name: "Grenade",
    sourceId: "feature-grenade",
    activation: "quick",
    attackType: "ranged",
    targetType: "blast",
    range: [{ type: "range", value: 5 }],
    roll: "1d20",
    damage: [{ type: "explosive", expression: "3" }],
    effects: [],
    resourceCosts: { uses: 1 },
    triggers: [],
  }],
});

const npc = composeLancerNpc({ name: "Red One", tier: 2, classItem: assault, templates: [veteran], optionalFeatures: [grenade] });
check(npc.state.kind === "npc", "composition creates canonical NPC state");
check(npc.state.resources.hp?.max === 15, "tier selects the correct HP value");
check(npc.state.resources.heat?.max === 8, "tier selects the correct heat cap");
check(npc.state.stats.evasion === 10, "tier selects class statistics");
check(npc.state.stats.armor === 2, "template stat effects are applied");
check(npc.actionIds.includes("assault-rifle") && npc.actionIds.includes("grenade"), "class and optional actions are composed");

const deployment = parseLancerDeploymentHexes("0,0; 1:0\n2/1; 1:0; invalid");
check(deployment.length === 3, "deployment parser accepts supported formats and removes duplicates");
check(deployment[2]?.q === 2 && deployment[2]?.r === 1, "deployment parser preserves coordinates");

const objective: LancerEncounterObjective = {
  type: "elimination",
  name: "Clear the field",
  description: "",
  roundLimit: 6,
  victoryCondition: "No hostiles remain",
  defeatCondition: "No players remain",
  scoreTarget: null,
  triggers: [],
};
const errors = validateLancerEncounter({
  name: "Test",
  mapId: "map",
  objective,
  roster: [{ blueprintId: "npc", count: 2 }],
  deployment: { player: [], enemy: [{ q: 0, r: 0 }], reserve: [] },
});
check(errors.some((error) => error.includes("2 hexágono")), "encounter validates enemy deployment capacity");
check(evaluateLancerObjective(objective, { round: 2, playerScore: 0, hostileScore: 0, hostilesRemaining: 0, playersRemaining: 1 }) === "victory", "elimination objective recognizes victory");
check(evaluateLancerObjective(objective, { round: 2, playerScore: 0, hostileScore: 0, hostilesRemaining: 2, playersRemaining: 0 }) === "defeat", "objective recognizes defeat");

console.log(`LANCER GM checks: ${assertions} assertions passed`);
