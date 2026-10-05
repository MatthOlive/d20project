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

console.log(
  `Pokérole accuracy checks passed; ${importedMoves.length} imported move names are unique after normalization.`,
);
