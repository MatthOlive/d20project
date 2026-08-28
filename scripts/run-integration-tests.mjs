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

const sync = await importTypeScript("src/lib/multiplayer-sync.ts");

{
  const version1 = { id: "session", version: 1, turn: "a" };
  const version2 = { id: "session", version: 2, turn: "b" };
  const clientA = sync.reconcileVersionedState(
    sync.reconcileVersionedState(null, version1),
    version2,
  );
  const clientB = sync.reconcileVersionedState(
    sync.reconcileVersionedState(null, version2),
    version1,
  );
  assert.deepEqual(clientA, version2);
  assert.deepEqual(clientB, version2, "out-of-order realtime must converge on the newest state");
}

{
  const events = [
    { id: 10, version: 2, command: "move" },
    { id: 9, version: 1, command: "initiative" },
  ];
  const duplicate = { id: 10, version: 2, command: "move" };
  const newer = { id: 11, version: 3, command: "reaction" };
  const reconciled = sync.reconcileVersionedEvents(
    sync.reconcileVersionedEvents(events, duplicate),
    newer,
  );
  assert.deepEqual(
    reconciled.map((event) => event.id),
    [11, 10, 9],
  );
  assert.equal(reconciled.filter((event) => event.id === 10).length, 1);
}

{
  const merged = sync.mergeServerWithPending(
    { hp: 8, will: 4, name: "Eevee" },
    { hp: 7, will: 5 },
    { name: "Eevee A" },
    { hp: 6 },
  );
  assert.deepEqual(merged, { hp: 6, will: 5, name: "Eevee A" });
}

const atomicCombatSql = await readFile(
  resolve("supabase/migrations/20260827123000_atomic_pokerole_move_resolution.sql"),
  "utf8",
);
const engineSql = await readFile(
  resolve("supabase/migrations/20260827130000_server_validated_game_engine_commands.sql"),
  "utf8",
);
assert.match(atomicCombatSql, /for update/i);
assert.match(atomicCombatSql, /submit_pokerole_move_reaction/i);
assert.match(atomicCombatSql, /finalize_pokerole_move/i);
assert.match(engineSql, /commit_game_engine_command/i);
assert.match(engineSql, /p_expected_version/i);

console.log(
  "Integration tests passed: multiplayer convergence, pending saves and atomic contracts.",
);
