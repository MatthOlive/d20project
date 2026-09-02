import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

async function importTypeScript(relativePath) {
  const filePath = resolve(relativePath);
  const source = await readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
    fileName: filePath,
  }).outputText;
  const encoded = Buffer.from(
    `${output}\n//# sourceURL=${filePath.replaceAll("\\", "/")}`,
  ).toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

function participant(id, kind, ownerId, initiative) {
  return {
    id,
    tokenId: `token-${id}`,
    characterId: `character-${id}`,
    kind,
    ownerId,
    name: id,
    imageUrl: null,
    initiative,
    initiativePool: 3,
    initiativeModifier: 0,
    actionsUsed: 0,
    resources: {},
    metadata: {},
  };
}

const resolution = await importTypeScript("src/lib/move-resolution.ts");
const engine = await importTypeScript("src/lib/game-engine/core.ts");
const pokerole = await importTypeScript("src/lib/pokerole.ts");
const digirole = await importTypeScript("src/lib/digirole.ts");

{
  const attrs = { strength: 3, dexterity: 4, vitality: 2, wisdom: 2, spirit: 5, charisma: 1 };
  const skills = { Clash: 2, Alert: 1, Athletic: 3 };
  assert.equal(digirole.digiRoleFormulaPool("STR + Clash + 1", attrs, skills), 6);
  assert.equal(digirole.digiRoleFormulaPool("DEX + alert", attrs, skills), 5);
  assert.equal(digirole.digiRoleAttributeModifier("Vaccine", "Virus"), 1);
  assert.equal(digirole.digiRoleAttributeModifier("Virus", "Vaccine"), -1);
  assert.equal(digirole.digiRoleFieldAccuracyModifier("VB", ["NSo", "NSp"]), 0);
  assert.equal(digirole.digiRoleDamageAfterDefense(0, 0), 1);
  assert.equal(digirole.digiRoleDamageAfterDefense(8, 2, -1), 5);
  assert.equal(digirole.digiRoleDamageAfterDefense(8, 2, 1, true), 0);
}

{
  const skills = { Athletic: 4, Brawl: 2 };
  assert.deepEqual(pokerole.resolveSkillValue("athletic", skills), {
    value: 4,
    label: "Athletic",
  });
  assert.deepEqual(pokerole.resolveSkillValue("athletics", skills), {
    value: 4,
    label: "Athletic",
  });
  assert.deepEqual(pokerole.resolveSkillValue("brawl/athletics", skills), {
    value: 4,
    label: "Athletic",
  });
}

{
  const result = resolution.resolveMoveAccuracy(4, 2, 1);
  assert.equal(result.requiredSuccesses, 3);
  assert.equal(result.criticalSuccesses, 5);
  assert.equal(result.isHit, true);
  assert.equal(result.isCritical, false);
  assert.equal(resolution.resolveMoveAccuracy(5, 2, 1).isCritical, true);
}

{
  const targets = [
    { requestId: "normal", immune: false, finalDamage: 0 },
    { requestId: "evade", immune: false, finalDamage: 5 },
    { requestId: "clash", immune: false, finalDamage: 5 },
    { requestId: "immune", immune: true, finalDamage: 5 },
    { requestId: "failed", immune: false, finalDamage: 0 },
  ];
  const adjusted = resolution.adjustedDamageTargets(targets, [
    { requestId: "evade", choice: "evade", succeeded: true },
    { requestId: "clash", choice: "clash", succeeded: true },
    { requestId: "failed", choice: "evade", succeeded: false },
  ]);
  assert.deepEqual(
    adjusted.map((target) => target.finalDamage),
    [1, 0, 1, 0, 1],
  );
}

{
  const narrator = { userId: "gm", isNarrator: true };
  const player = { userId: "player", isNarrator: false };
  const initial = engine.createEngineState({
    systemId: "pokerole",
    pageId: "page",
    participants: [
      participant("trainer", "trainer", "player", 99),
      participant("pokemon", "pokemon", "player", 1),
    ],
  });
  const running = engine.applyEngineCommand(initial, { type: "start_turns" }, narrator);
  assert.equal(running.participants[0].kind, "pokemon");
  assert.equal(running.participants[1].kind, "trainer");

  const pokemonAction = engine.applyEngineCommand(
    running,
    {
      type: "record_action",
      participantId: "pokemon",
      actionType: "move",
      label: "Tackle",
      resultSuccesses: 2,
    },
    player,
  );
  assert.equal(pokemonAction.participants[0].actionsUsed, 1);
  assert.equal(pokemonAction.lastMove.name, "Tackle");

  const trainerTurn = engine.applyEngineCommand(pokemonAction, { type: "advance_turn" }, player);
  assert.equal(trainerTurn.participants[0].actionsUsed, 1);
  const trainerAction = engine.applyEngineCommand(
    trainerTurn,
    {
      type: "record_action",
      participantId: "trainer",
      actionType: "item",
      label: "Potion",
    },
    player,
  );
  const nextRound = engine.applyEngineCommand(trainerAction, { type: "advance_turn" }, player);
  assert.equal(nextRound.round, 2);
  assert.equal(nextRound.participants[0].actionsUsed, 0);
  assert.equal(nextRound.participants[1].actionsUsed, 0);
  assert.equal(nextRound.lastMove, null);

  assert.throws(
    () =>
      engine.applyEngineCommand(
        running,
        {
          type: "record_action",
          participantId: "pokemon",
          actionType: "move",
        },
        { userId: "other", isNarrator: false },
      ),
    /não controla/i,
  );
  assert.equal(initial.status, "setup", "commands must not mutate their input state");
}

{
  const shared = participant("shared-pokemon", "pokemon", "owner", null);
  shared.metadata.controllerIds = ["owner", "invited-player"];
  const initial = engine.createEngineState({
    systemId: "pokerole",
    pageId: "page",
    participants: [shared],
  });
  const withPlayerInitiative = engine.applyEngineCommand(
    initial,
    { type: "set_initiative", participantId: shared.id, value: 4 },
    { userId: "invited-player", isNarrator: false },
  );
  assert.equal(withPlayerInitiative.participants[0].initiative, 4);
}

{
  const narrator = { userId: "gm", isNarrator: true };
  const initial = engine.createEngineState({
    systemId: "digirole",
    pageId: "page",
    participants: [
      participant("digimon-high", "digirole_digimon", "player", 20),
      participant("tamer-low", "digirole_tamer", "player", 1),
      participant("digimon-low", "digirole_digimon", "player", 2),
      participant("tamer-high", "digirole_tamer", "player", 10),
    ],
  });
  const running = engine.applyEngineCommand(initial, { type: "start_turns" }, narrator);
  assert.deepEqual(
    running.participants.map((entry) => entry.id),
    ["digimon-high", "digimon-low", "tamer-high", "tamer-low"],
  );

  const firstTamerAction = engine.applyEngineCommand(
    running,
    {
      type: "record_action",
      participantId: "tamer-high",
      actionType: "item",
    },
    { userId: "player", isNarrator: false },
  );
  const secondTamerAction = engine.applyEngineCommand(
    firstTamerAction,
    {
      type: "record_action",
      participantId: "tamer-high",
      actionType: "other",
    },
    { userId: "player", isNarrator: false },
  );
  const tamerReaction = engine.applyEngineCommand(
    secondTamerAction,
    {
      type: "record_action",
      participantId: "tamer-high",
      actionType: "reaction",
    },
    { userId: "player", isNarrator: false },
  );
  assert.equal(
    tamerReaction.participants.find((entry) => entry.id === "tamer-high").actionsUsed,
    3,
  );

  const digimonReaction = engine.applyEngineCommand(
    tamerReaction,
    {
      type: "record_action",
      participantId: "digimon-high",
      actionType: "reaction",
    },
    { userId: "player", isNarrator: false },
  );
  const afterDigimonHigh = engine.applyEngineCommand(
    digimonReaction,
    { type: "advance_turn" },
    narrator,
  );
  const afterDigimonLow = engine.applyEngineCommand(
    afterDigimonHigh,
    { type: "advance_turn" },
    narrator,
  );
  const afterTamerHigh = engine.applyEngineCommand(
    afterDigimonLow,
    { type: "advance_turn" },
    narrator,
  );
  assert.equal(
    afterTamerHigh.participants.find((entry) => entry.id === "digimon-high").actionsUsed,
    1,
  );
  const afterTamerLow = engine.applyEngineCommand(
    afterTamerHigh,
    { type: "advance_turn" },
    narrator,
  );
  assert.equal(
    afterTamerLow.participants.find((entry) => entry.id === "digimon-high").actionsUsed,
    0,
  );
  assert.equal(
    afterTamerLow.participants.find((entry) => entry.id === "tamer-high").actionsUsed,
    0,
  );

  const sharedDigimon = participant("shared-digimon", "digirole_digimon", "owner", null);
  sharedDigimon.metadata.controllerIds = ["owner", "partner"];
  const sharedEncounter = engine.createEngineState({
    systemId: "digirole",
    pageId: "page",
    participants: [sharedDigimon],
  });
  const withPartnerInitiative = engine.applyEngineCommand(
    sharedEncounter,
    { type: "set_initiative", participantId: sharedDigimon.id, value: 3 },
    { userId: "partner", isNarrator: false },
  );
  assert.equal(withPartnerInitiative.participants[0].initiative, 3);
}

console.log("Core tests passed: skill aliases, move resolution and game engine.");
