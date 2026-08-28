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

console.log("Core tests passed: skill aliases, move resolution and game engine.");
