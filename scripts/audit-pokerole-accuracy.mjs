import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile("src/lib/pokerole.ts", "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const pokerole = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

// The Corebook formulas for Simple Beam and Stabilize an Ally use Empathy and
// Medicine. Those skills are excluded from the standard Pokémon skill list, so
// the UI must request an explicit accuracy pool instead of silently substituting.
const accuracy = (name) => {
  const result = pokerole.correctedMoveAccuracy({
    name,
    accuracy_stat: null,
    accuracy_skill: null,
  });
  return [result.accuracy_stat, result.accuracy_skill];
};
assert.deepEqual(accuracy("Simple Beam"), [null, null]);
assert.deepEqual(accuracy("Any Move"), [null, null]);
assert.deepEqual(accuracy("Stabilize an Ally"), [null, null]);
assert.equal(pokerole.SKILLS.includes("Medicine"), false);
assert.equal(pokerole.SKILLS.includes("Empathy"), false);
assert.equal(pokerole.TRAINER_SKILLS.includes("Medicine"), true);
assert.equal(pokerole.TRAINER_SKILLS.includes("Empathy"), true);

const sql = await readFile(
  "supabase/migrations/20260805120000_paldea_hisui_pokerole_catalog.sql",
  "utf8",
);
const matches = sql.match(/\$moves\$([\s\S]*?)\$moves\$/);
assert.ok(matches, "Pokérole move catalog was not found in its migration");
const importedMoves = JSON.parse(matches[1]);
const duplicateNames = importedMoves
  .map((move) =>
    move.name
      .normalize("NFKC")
      .trim()
      .replace(/[\s_-]+/g, " ")
      .toLocaleLowerCase("en"),
  )
  .filter((name, index, all) => all.indexOf(name) !== index);
assert.deepEqual(
  duplicateNames,
  [],
  "Duplicate normalized move names exist in the imported catalog",
);

// A conservative audit for descriptions ending in a phrase that usually signals
// a page-break truncation. This is not a semantic proof; each flagged move is
// cross-checked against the Corebook and recorded in the guarded repair migration.
const danglingEnding =
  /\b(?:to|of|the|a|an|if|when|at|by|for|from|with|and|or|until|during|after|before|because|equal|than|on|into|up|per|its|their|is|are|will|can|cannot|must|has|have|this|that|which|who|whom|each|every|such|one|two|three|four|damage|roll|add|reduce|increase|against|affected|effects|effect|user|foe|target|ally|allies|round|scene|sleep)$/i;
const flaggedMoves = importedMoves.filter((move) =>
  danglingEnding.test((move.effect ?? "").trim()),
);
const repairSql = await readFile(
  "supabase/migrations/20261022210500_restore_truncated_pokerole_move_effects.sql",
  "utf8",
);
const repairedNames = new Set(
  [...repairSql.matchAll(/^\s{2}\(\s*\r?\n\s{4}'([^']+)'/gm)].map((match) =>
    match[1].normalize("NFKC").trim().toLocaleLowerCase("en"),
  ),
);
const unrepairedFlags = flaggedMoves
  .filter((move) => !repairedNames.has(move.name.normalize("NFKC").trim().toLocaleLowerCase("en")))
  .map((move) => move.name);
assert.deepEqual(
  unrepairedFlags,
  [],
  `Potentially truncated imported move descriptions lack a guarded repair: ${unrepairedFlags.join(", ")}`,
);

console.log(
  `Pokérole accuracy checks passed; ${importedMoves.length} imported move names are unique and ${flaggedMoves.length} suspicious description endings have guarded repairs.`,
);
