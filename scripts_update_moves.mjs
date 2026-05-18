import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key);
const parsed = JSON.parse(fs.readFileSync("/tmp/parsed.json", "utf8"));
const NORM_STAT = { beauty: "beautiful", "missing beauty": null, "same as the copied move": null };
const NORM_CAT  = { "???": "support", "physical/special": "physical" };
const ns = v => (!v ? null : (NORM_STAT[v] !== undefined ? NORM_STAT[v] : v));
let ok = 0, fail = 0, missing = [];
for (let i = 0; i < parsed.length; i++) {
  const p = parsed[i];
  let sk = p.accuracy_skill; if (sk === "varies") sk = null;
  const row = {
    type: p.type,
    power: p.power,
    accuracy_stat: ns(p.accuracy_stat),
    accuracy_skill: sk,
    damage_stat: ns(p.damage_stat),
    effect: p.effect,
    category: NORM_CAT[p.category] ?? p.category,
  };
  const { error, count, data } = await sb.from("moves").update(row).eq("name", p.name).select("id");
  if (error) { fail++; console.error(p.name, error.message); }
  else { ok++; if ((data?.length ?? 0) === 0) missing.push(p.name); }
  if (i % 50 === 0) process.stdout.write(`.`);
}
console.log(`\nupdated ok=${ok} fail=${fail} not_in_db=${missing.length}`);
if (missing.length) console.log("first missing:", missing.slice(0, 10));
