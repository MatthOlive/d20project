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
const tormenta20 = await importTypeScript("src/lib/tormenta20.ts");

{
  const sql = await readFile(
    "supabase/migrations/20261023004817_t20_attack_damage_resolution.sql",
    "utf8",
  );
  const inventoryMigration = await readFile(
    "supabase/migrations/20261023010804_t20_inventory_load.sql",
    "utf8",
  );
  assert.match(inventoryMigration, /inventory_items jsonb not null default '\[\]'::jsonb/i);
  assert.match(
    inventoryMigration,
    /coins_total integer not null default 0 check \(coins_total >= 0\)/i,
  );
  assert.match(inventoryMigration, /adventure_backpack boolean not null default false/i);
  assert.doesNotMatch(
    inventoryMigration,
    /\bupdate\s+public\.t20_characters\b/i,
    "Legacy text inventories must not be guessed or rewritten",
  );
  const equipmentMigration = await readFile(
    "supabase/migrations/20261023010251_t20_equipment_defense.sql",
    "utf8",
  );
  assert.match(
    equipmentMigration,
    /equipment_rules_enabled boolean not null default false/i,
    "Existing manual Defense remains opt-in",
  );
  assert.match(sql, /security invoker/i, "T20 damage RPC must respect caller RLS");
  assert.match(
    sql,
    /floor\(random\(\) \* 20\)::integer \+ 1/i,
    "Attack die is rolled on the database",
  );
  assert.match(
    sql,
    /v_total >= v_target\.defense/i,
    "Attack result compares against database target Defense",
  );
  assert.match(sql, /v_user_id <> v_attacker_owner_id AND v_user_id <> v_narrator_id/i);
  assert.match(sql, /revoke all on function public\.roll_t20_attack[\s\S]*?from public, anon/i);
  assert.match(
    sql,
    /is_game_narrator\(game_id, \(select auth\.uid\(\)\)\)/i,
    "Only narrator may create a resolution",
  );
  assert.match(sql, /for update/i, "Target HP must be locked while applying damage");
  assert.match(
    sql,
    /on conflict \(source_message_id\) do nothing/i,
    "A source attack may resolve only once",
  );
  assert.match(sql, /Damage for this attack has already been applied/i);
  assert.match(sql, /v_total < v_defense/i, "The RPC must reject attacks that did not hit");
  assert.match(sql, /is distinct from 'true'/i, "Missing or false hit flags must be rejected");
  assert.match(sql, /v_die is null or v_modifier is null or v_total is null or v_defense is null/i);
}

{
  const attrs = {
    forca: 4,
    destreza: 2,
    constituicao: 1,
    inteligencia: 0,
    sabedoria: 1,
    carisma: 0,
  };
  assert.equal(tormenta20.t20TrainingBonus(1), 2);
  assert.equal(tormenta20.t20TrainingBonus(6), 2);
  assert.equal(tormenta20.t20TrainingBonus(7), 4);
  assert.equal(tormenta20.t20TrainingBonus(14), 4);
  assert.equal(tormenta20.t20TrainingBonus(15), 6);
  assert.equal(Object.keys(tormenta20.T20_CLASS_TRAINING).length, tormenta20.T20_CLASSES.length);
  assert.equal(
    Object.keys(tormenta20.T20_CLASS_DERIVED_STATS).length,
    tormenta20.T20_CLASSES.length,
  );
  assert.deepEqual(tormenta20.calculateT20ClassDerivedStats("Arcanista", 1, 2, 3), {
    hpMax: 10,
    mpMax: 6,
    baseDefense: 13,
  });
  assert.deepEqual(tormenta20.calculateT20ClassDerivedStats("Bárbaro", 3, 2, 1), {
    hpMax: 42,
    mpMax: 9,
    baseDefense: 11,
  });
  assert.deepEqual(tormenta20.calculateT20ClassDerivedStats("Arcanista", 3, -3, 0), {
    hpMax: 7,
    mpMax: 18,
    baseDefense: 10,
  });
  assert.equal(tormenta20.calculateT20ClassDerivedStats("Desconhecida", 1, 0, 0), null);
  assert.deepEqual(tormenta20.calculateT20EquipmentDefense(3, null, null), {
    defense: 13,
    armorPenalty: 0,
    armorIsHeavy: false,
    armorBonus: 0,
    shieldBonus: 0,
  });
  assert.deepEqual(tormenta20.calculateT20EquipmentDefense(3, "Armadura de couro", "Escudo leve"), {
    defense: 16,
    armorPenalty: 1,
    armorIsHeavy: false,
    armorBonus: 2,
    shieldBonus: 1,
  });
  assert.deepEqual(tormenta20.calculateT20EquipmentDefense(3, "Cota de malha", "Escudo pesado"), {
    defense: 18,
    armorPenalty: 4,
    armorIsHeavy: true,
    armorBonus: 6,
    shieldBonus: 2,
  });
  assert.equal(tormenta20.calculateT20EquipmentDefense(2, "armadura completa", null)?.defense, 20);
  assert.equal(tormenta20.calculateT20EquipmentDefense(2, "armadura desconhecida", null), null);
  assert.equal(tormenta20.calculateT20CarryingCapacity(2), 14);
  assert.equal(tormenta20.calculateT20CarryingCapacity(-2), 8);
  assert.equal(tormenta20.calculateT20CarryingCapacity(2, true), 16);
  assert.deepEqual(
    tormenta20.calculateT20Encumbrance(
      2,
      [{ id: "sword", name: "Montante", quantity: 1, spacesEach: 2 }],
      1500,
      true,
    ),
    {
      capacity: 16,
      maximumCapacity: 32,
      itemSpaces: 2,
      carriedItemSpaces: 2,
      equipmentSpaces: 0,
      coinSpaces: 1.5,
      spaces: 3.5,
      overloaded: false,
      overMaximum: false,
      skillPenalty: 0,
      speedPenalty: 0,
    },
  );
  assert.deepEqual(
    tormenta20.calculateT20Encumbrance(
      0,
      [{ id: "load", name: "Caixa", quantity: 11, spacesEach: 1 }],
      0,
    ),
    {
      capacity: 10,
      maximumCapacity: 20,
      itemSpaces: 11,
      carriedItemSpaces: 11,
      equipmentSpaces: 0,
      coinSpaces: 0,
      spaces: 11,
      overloaded: true,
      overMaximum: false,
      skillPenalty: 5,
      speedPenalty: 3,
    },
  );
  assert.equal(
    tormenta20.calculateT20Encumbrance(
      0,
      [{ id: "load", name: "Caixa", quantity: 21, spacesEach: 1 }],
      0,
    ).overMaximum,
    true,
  );
  assert.deepEqual(
    tormenta20.calculateT20Encumbrance(
      0,
      [{ id: "dagger", name: "Adaga", quantity: 1, spacesEach: 1 }],
      0,
      false,
      "Armadura completa",
      "Escudo pesado",
    ),
    {
      capacity: 10,
      maximumCapacity: 20,
      itemSpaces: 8,
      carriedItemSpaces: 1,
      equipmentSpaces: 7,
      coinSpaces: 0,
      spaces: 8,
      overloaded: false,
      overMaximum: false,
      skillPenalty: 0,
      speedPenalty: 0,
    },
  );
  assert.equal(tormenta20.isValidT20DamageDice("1d8"), true);
  assert.equal(tormenta20.isValidT20DamageDice("20d20"), true);
  assert.equal(tormenta20.isValidT20DamageDice("21d20"), false);
  assert.equal(tormenta20.isValidT20DamageDice("1d100"), false);
  assert.equal(
    tormenta20.t20WeaponDamageExpression(
      { damageDice: "1d8", damageBonus: 2, addStrength: true },
      3,
    ),
    "1d8+5",
  );
  assert.equal(
    tormenta20.t20WeaponDamageExpression(
      { damageDice: "1d6", damageBonus: 0, addStrength: false },
      4,
    ),
    "1d6",
  );
  assert.equal(tormenta20.t20AttackHits(15, 15), true);
  assert.equal(tormenta20.t20AttackHits(14, 15), false);
  assert.equal(tormenta20.t20AttackHits(Number.NaN, 15), false);
  assert.deepEqual(tormenta20.parseT20DamageExpression("2d6+5"), {
    count: 2,
    faces: 6,
    modifier: 5,
  });
  assert.deepEqual(tormenta20.parseT20DamageExpression("1d8-2"), {
    count: 1,
    faces: 8,
    modifier: -2,
  });
  assert.equal(tormenta20.parseT20DamageExpression("21d20"), null);
  assert.equal(tormenta20.parseT20DamageExpression("1d100"), null);
  assert.equal(tormenta20.T20_ORIGINS.length, 35);
  const validT20Skills = new Set(tormenta20.T20_SKILLS);
  for (const rule of Object.values(tormenta20.T20_CLASS_TRAINING)) {
    for (const skill of [...rule.fixed, ...rule.choices, ...(rule.requiredChoice ?? [])]) {
      assert.equal(validT20Skills.has(skill), true, `Unknown class skill: ${skill}`);
    }
  }
  for (const [origin, skills] of Object.entries(tormenta20.T20_ORIGIN_SKILL_OPTIONS)) {
    assert.equal(
      skills.length >= 2 || origin === "Amnésico",
      true,
      `Origin needs its exception reviewed: ${origin}`,
    );
    for (const skill of skills)
      assert.equal(validT20Skills.has(skill), true, `Unknown origin skill: ${skill}`);
  }
  assert.equal(
    tormenta20.t20OriginTrainingComplete("Acólito", { Religiao: true, Cura: true }),
    true,
  );
  assert.equal(
    tormenta20.t20OriginTrainingComplete("Acolito", { Religiao: true, Cura: true }),
    true,
  );
  assert.equal(tormenta20.t20OriginTrainingComplete("Acólito", { Religiao: true }), false);
  assert.equal(
    tormenta20.t20OriginTrainingComplete("Amnésico", { Religiao: true, Cura: true }),
    false,
  );
  assert.deepEqual(
    [...tormenta20.t20OriginTrainedSkills("Acólito", { Religiao: true, Cura: true })].sort(),
    ["Cura", "Religiao"].sort(),
  );
  assert.equal(tormenta20.t20ClassTrainingComplete("Arcanista", {}), false);
  const arcanistTraining = { Conhecimento: true, Diplomacia: true };
  assert.equal(tormenta20.t20ClassTrainingComplete("Arcanista", arcanistTraining), true);
  assert.deepEqual(
    [...tormenta20.t20ClassTrainedSkills("Arcanista", arcanistTraining)].sort(),
    ["Conhecimento", "Diplomacia", "Misticismo", "Vontade"].sort(),
  );
  assert.equal(
    tormenta20.t20ClassTrainingComplete("Cacador", {
      Pontaria: true,
      Atletismo: true,
      Cavalgar: true,
    }),
    false,
  );
  assert.equal(
    tormenta20.t20ClassTrainingComplete("Cacador", {
      Pontaria: true,
      Atletismo: true,
      Cavalgar: true,
      Cura: true,
      Fortitude: true,
      Furtividade: true,
      Iniciativa: true,
    }),
    true,
  );
  assert.equal(
    tormenta20.t20ClassTrainingComplete("Caçador", {
      Pontaria: true,
      Atletismo: true,
      Cavalgar: true,
      Cura: true,
      Fortitude: true,
      Furtividade: true,
      Iniciativa: true,
    }),
    true,
  );
  assert.deepEqual(
    tormenta20.t20SkillCheck("Luta", {
      level: 3,
      attributes: attrs,
      trained: false,
      useRules: true,
    }),
    { modifier: 5, canRoll: true, trainedOnly: false },
  );
  assert.equal(
    tormenta20.t20SkillCheck("Luta", {
      level: 3,
      attributes: attrs,
      trained: true,
      useRules: true,
    }).modifier,
    7,
  );
  assert.equal(
    tormenta20.t20SkillCheck("Conhecimento", {
      level: 8,
      attributes: attrs,
      trained: false,
      useRules: true,
    }).canRoll,
    false,
  );
  assert.equal(
    tormenta20.t20SkillCheck("Conhecimento", {
      level: 8,
      attributes: attrs,
      trained: false,
      useRules: false,
      manualBonus: 11,
    }).modifier,
    11,
  );
  assert.equal(
    tormenta20.t20SkillCheck("Acrobacia", {
      level: 4,
      attributes: attrs,
      trained: false,
      useRules: true,
      armorPenalty: 3,
    }).modifier,
    1,
  );
  assert.equal(
    tormenta20.t20SkillCheck("Furtividade", {
      level: 4,
      attributes: attrs,
      trained: true,
      useRules: true,
      armorPenalty: 2,
    }).modifier,
    4,
  );
  assert.equal(
    tormenta20.t20SkillCheck("Luta", {
      level: 4,
      attributes: attrs,
      trained: false,
      useRules: true,
      armorPenalty: 3,
    }).modifier,
    6,
  );
}

{
  const values = {
    special: 5,
    cute: 3,
    tough: 4,
    cool: 2,
    clever: 4,
    insight: 3,
    will: 7,
    beautiful: 4,
    dexterity: 1,
  };
  const skills = { Perform: 3, Nature: 2, Channel: 4, Etiquette: 3, Athletic: 2 };
  const move = (name) => ({ name, accuracy_stat: null, accuracy_skill: null });
  const pool = (name) =>
    pokerole.moveAccuracyPool(move(name), (key) => values[key] ?? 0, skills).pool;
  assert.equal(pool("Bug Buzz"), 8);
  assert.equal(pool("Sing"), 6);
  assert.equal(pool("Growl"), 7);
  assert.equal(pool("After You"), 5);
  assert.equal(pool("Simple Beam"), 0);
  assert.equal(pool("Stabilize an Ally"), 0);
  assert.equal(
    pokerole.moveNeedsAccuracyChoice({
      name: "Simple Beam",
      accuracy_stat: "insight",
      accuracy_skill: "empathy",
    }),
    true,
  );
  assert.equal(
    pokerole.moveNeedsAccuracyChoice({
      name: "Stabilize an Ally",
      accuracy_stat: "clever",
      accuracy_skill: "medicine",
    }),
    true,
  );
  assert.equal(pokerole.SKILLS.includes("Medicine"), false);
  assert.equal(pokerole.SKILLS.includes("Empathy"), false);
  assert.equal(pokerole.TRAINER_SKILLS.includes("Medicine"), true);
  assert.equal(pokerole.TRAINER_SKILLS.includes("Empathy"), true);
  assert.equal(pool("Final Gambit"), 9);
  assert.equal(pool("Quiver Dance"), 7);
  assert.equal(pokerole.moveNeedsAccuracyChoice(move("Copycat")), true);
  assert.equal(pokerole.moveNeedsAccuracyChoice(move("Hidden Power")), true);
  assert.equal(pokerole.moveNeedsAccuracyChoice(move("Unknown homebrew")), true);
  assert.equal(pokerole.resolveSkillValue("perform.", skills).value, 3);
  assert.equal(pokerole.resolveSkillValue("athletic e", skills).value, 2);
  assert.deepEqual(pokerole.resolveSkillValue("channel e", {}), { value: 0, label: "Channel" });
  assert.deepEqual(pokerole.resolveSkillValue("nature e", null), { value: 0, label: "Nature" });
  assert.deepEqual(pokerole.resolveSkillValue("perform.", { "Perform e": 3 }), {
    value: 3,
    label: "Perform",
  });
}

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

console.log(
  "Core tests passed: T20 attack/damage contract, skill aliases, move resolution and game engine.",
);
