import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchKnowledge } from "./knowledge.functions";

// ---------- Knowledge: Pokérole 2.0 core mechanics (fallback when no RAG hits) ----------
const POKEROLE_RULES = `
POKÉROLE 2.0 — CORE MECHANICS

DICE: Pools of d6. 4/5/6 = success. Difficulty 1–5 or opposed.
INITIATIVE: Dexterity + Alert (count successes; highest acts first).
ACCURACY: Accuracy Attribute + Accuracy Skill in d6.
  Trainer attacks: Dexterity + Brawl/Throw/Weapons.
  Pokémon attacks: Dexterity + Brawl/Channel.
  Defender's Evasion = Dex + Evasion.
DAMAGE: Damage Stat + Move Power in d6, then subtract Defense (Vitality, or Special for Special moves). STAB = +1 die.
HP: Trainer = 4 + Vitality. Pokémon = species base HP + Vitality.
PAIN PENALTY: ≤ half HP = −1 success on all rolls. 1 HP = −2.
WILL: Max = Insight + 2. Spent for Channel / mental resistance.
RANKS (and caps): Starter (+2 attr / 5 skill, max 1 per skill),
Beginner (+4 / 10, max 2), Amateur (+6 / 15, max 3),
Ace (+8 / 20, max 4), Pro (+10 / 25, max 5), Master (+12 / 30, max 5).
MOVES KNOWN: Insight + 2.
`;

const RANK_ORDER = ["starter", "beginner", "amateur", "ace", "pro", "master"] as const;
type Rank = (typeof RANK_ORDER)[number];

// Official Pokérole 2.0 distribution per rank.
const RANK_TABLE: Record<Rank, { attrPoints: number; skillPoints: number; skillCap: number; attrCap: number }> = {
  starter:  { attrPoints: 2,  skillPoints: 5,  skillCap: 1, attrCap: 3 },
  beginner: { attrPoints: 4,  skillPoints: 10, skillCap: 2, attrCap: 4 },
  amateur:  { attrPoints: 6,  skillPoints: 15, skillCap: 3, attrCap: 4 },
  ace:      { attrPoints: 8,  skillPoints: 20, skillCap: 4, attrCap: 5 },
  pro:      { attrPoints: 10, skillPoints: 25, skillCap: 5, attrCap: 5 },
  master:   { attrPoints: 12, skillPoints: 30, skillCap: 5, attrCap: 5 },
};

const POKEMON_ATTR_KEYS = ["strength", "dexterity", "vitality", "special", "insight"];
const TRAINER_ATTR_KEYS = ["strength", "dexterity", "vitality", "insight"];
const POKEMON_SKILL_KEYS = [
  "Brawl", "Channel", "Clash", "Evasion", "Alert", "Athletic", "Nature", "Stealth",
  "Allure", "Etiquette", "Intimidate", "Perform", "Crafts", "Lore", "Medicine", "Science", "Empathy",
];
const TRAINER_SKILL_KEYS = [
  "Brawl", "Throw", "Weapons", "Clash", "Evasion", "Alert", "Athletic", "Nature", "Stealth",
  "Allure", "Etiquette", "Intimidate", "Perform", "Crafts", "Lore", "Medicine", "Science", "Empathy",
];

function rollD6Pool(n: number) {
  const dice: number[] = [];
  for (let i = 0; i < Math.max(0, Math.min(50, n)); i++) dice.push(1 + Math.floor(Math.random() * 6));
  return { dice, successes: dice.filter((d) => d >= 4).length, ones: dice.filter((d) => d === 1).length };
}

function distributePoints(
  base: Record<string, number>,
  keys: string[],
  points: number,
  cap: number,
  preferred?: string[],
): Record<string, number> {
  const out: Record<string, number> = { ...base };
  for (const k of keys) if (out[k] == null) out[k] = 0;
  // Apply preferred first.
  const order = [
    ...(preferred ?? []).filter((k) => keys.includes(k)),
    ...keys.filter((k) => !(preferred ?? []).includes(k)),
  ];
  let remaining = points;
  let safety = 200;
  while (remaining > 0 && safety-- > 0) {
    let placed = false;
    for (const k of order) {
      if (remaining <= 0) break;
      if ((out[k] ?? 0) < cap) { out[k] = (out[k] ?? 0) + 1; remaining -= 1; placed = true; }
    }
    if (!placed) break;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SBClient = any;

async function spawnWildPokemon(
  supabase: SBClient,
  gameId: string,
  userId: string,
  params: {
    species: string; rank?: Rank; nickname?: string;
    preferred_attrs?: string[]; preferred_skills?: string[];
  },
): Promise<{ ok: boolean; message: string; pokemon_id?: string; summary?: Record<string, unknown> }> {
  const rank = (params.rank ?? "starter") as Rank;
  const tbl = RANK_TABLE[rank];
  const { data: speciesData, error: sErr } = await supabase
    .from("species").select("*").ilike("name", params.species).limit(1);
  if (sErr || !speciesData || speciesData.length === 0) {
    return { ok: false, message: `Species "${params.species}" not found in the Pokédex.` };
  }
  const sp = speciesData[0] as {
    id: string; name: string; base_hp: number; base_attrs: Record<string, number>;
    attr_limits: Record<string, number>; abilities: string[]; sprite_url: string | null;
  };
  // Attribute caps = min(species limit, rank cap).
  const limits = sp.attr_limits ?? {};
  const attrs: Record<string, number> = { ...sp.base_attrs };
  for (const k of POKEMON_ATTR_KEYS) if (attrs[k] == null) attrs[k] = 1;
  // Distribute attribute points respecting species cap & rank cap.
  let pts = tbl.attrPoints;
  const order = [...(params.preferred_attrs ?? []), ...POKEMON_ATTR_KEYS];
  let safety = 200;
  while (pts > 0 && safety-- > 0) {
    let placed = false;
    for (const k of order) {
      if (pts <= 0) break;
      const cap = Math.min(limits[k] ?? 5, tbl.attrCap);
      if ((attrs[k] ?? 1) < cap) { attrs[k] = (attrs[k] ?? 1) + 1; pts -= 1; placed = true; }
    }
    if (!placed) break;
  }
  const skills = distributePoints({}, POKEMON_SKILL_KEYS, tbl.skillPoints, tbl.skillCap, params.preferred_skills);

  const hp = sp.base_hp + (attrs.vitality ?? 1);
  const will = (attrs.insight ?? 1) + 2;

  const { data: ins1, error: iErr } = await supabase
    .from("pokemon").insert({
      game_id: gameId, owner_id: userId, species_id: sp.id,
      nickname: params.nickname ?? null, rank,
      current_attrs: attrs, skills, hp, will, current_hp: hp, current_will: will,
      image_url: sp.sprite_url, folder: "AI Encounters",
    }).select().single();
  if (iErr || !ins1) return { ok: false, message: `Failed to create Pokémon: ${String(iErr?.message ?? "unknown")}` };
  return {
    ok: true, pokemon_id: ins1.id,
    message: `Spawned ${sp.name} (${rank}) — HP ${hp}, Will ${will}.`,
    summary: { species: sp.name, rank, attrs, skills, hp, will, abilities: sp.abilities },
  };
}

async function spawnTrainer(
  supabase: SBClient,
  gameId: string,
  userId: string,
  params: {
    name: string; rank?: Rank; concept?: string; nature?: string;
    preferred_attrs?: string[]; preferred_skills?: string[];
  },
): Promise<{ ok: boolean; message: string; trainer_id?: string; summary?: Record<string, unknown> }> {
  const rank = (params.rank ?? "starter") as Rank;
  const tbl = RANK_TABLE[rank];
  const baseAttrs: Record<string, number> = { strength: 1, dexterity: 1, vitality: 1, insight: 1 };
  const attrs = distributePoints(baseAttrs, TRAINER_ATTR_KEYS, tbl.attrPoints, tbl.attrCap, params.preferred_attrs);
  const skills = distributePoints({}, TRAINER_SKILL_KEYS, tbl.skillPoints, tbl.skillCap, params.preferred_skills);
  const hp = 4 + (attrs.vitality ?? 1);
  const will = (attrs.insight ?? 1) + 2;

  const { data, error } = await supabase
    .from("trainers").insert({
      game_id: gameId, owner_id: userId, name: params.name, rank,
      concept: params.concept ?? null, nature: params.nature ?? null,
      attrs, skills,
      current_hp: hp, current_will: will,
      folder: "NPCs",
    }).select().single();
  if (error || !data) return { ok: false, message: `Failed to create trainer: ${String(error?.message ?? "unknown")}` };
  return {
    ok: true, trainer_id: data.id,
    message: `Created trainer ${params.name} (${rank}) — HP ${hp}, Will ${will}.`,
    summary: { name: params.name, rank, attrs, skills, hp, will },
  };
}

async function startCombat(
  supabase: SBClient,
  gameId: string,
  participants: { name: string; dex?: number; alert?: number; character_kind?: string; character_ref?: string }[],
) {
  await supabase.from("initiative").delete().eq("game_id", gameId);
  const rolled = participants.map((p) => {
    const pool = Math.max(1, (p.dex ?? 2) + (p.alert ?? 1));
    const r = rollD6Pool(pool);
    return { name: p.name, kind: p.character_kind ?? "pokemon", character_ref: p.character_ref, successes: r.successes, dice: r.dice };
  });
  rolled.sort((a, b) => b.successes - a.successes);
  const inserts = rolled.map((r, idx) => ({
    game_id: gameId, character_name: r.name, character_kind: r.kind,
    character_ref: r.character_ref ?? null, successes: r.successes, position: idx,
  }));
  const { error } = await supabase.from("initiative").insert(inserts);
  if (error) return { ok: false, order: [], message: `Failed to write initiative: ${String(error.message)}` };
  return {
    ok: true,
    order: rolled.map((r) => ({ name: r.name, successes: r.successes, dice: r.dice })),
    message: `Combat started. Turn order: ${rolled.map((r, i) => `${i + 1}. ${r.name} (${r.successes})`).join(" → ")}`,
  };
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "spawn_wild_pokemon",
      description: "Create a Pokémon sheet in the Files panel using the database Pokédex. Use whenever a Pokémon (wild, NPC trainer's, or starter gift) needs a stat block. Distributes attribute & skill points according to the official Pokérole rank table.",
      parameters: {
        type: "object",
        properties: {
          species: { type: "string", description: "Exact Pokédex name (e.g. Pikachu)." },
          rank: { type: "string", enum: RANK_ORDER as unknown as string[] },
          nickname: { type: "string" },
          preferred_attrs: { type: "array", items: { type: "string", enum: POKEMON_ATTR_KEYS }, description: "Attributes to favor when distributing rank points." },
          preferred_skills: { type: "array", items: { type: "string", enum: POKEMON_SKILL_KEYS }, description: "Skills to favor when distributing rank points." },
        },
        required: ["species"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spawn_trainer",
      description: "Create an NPC Trainer sheet in the Files panel with attributes and skills distributed by the official Pokérole rank table.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          rank: { type: "string", enum: RANK_ORDER as unknown as string[] },
          concept: { type: "string", description: "Short concept (Ranger, Rocket Grunt, etc.)." },
          nature: { type: "string" },
          preferred_attrs: { type: "array", items: { type: "string", enum: TRAINER_ATTR_KEYS } },
          preferred_skills: { type: "array", items: { type: "string", enum: TRAINER_SKILL_KEYS } },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_combat",
      description: "Roll initiative (Dex + Alert in d6, 4+ success) for every participant and open the turn order. Call this the moment combat begins.",
      parameters: {
        type: "object",
        properties: {
          participants: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                dex: { type: "number" },
                alert: { type: "number" },
                character_kind: { type: "string", enum: ["pokemon", "trainer", "wild"] },
                character_ref: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
        required: ["participants"],
      },
    },
  },
] as const;

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: unknown };

async function callGateway(messages: Msg[]) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages, tools: TOOLS, tool_choice: "auto",
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("AI rate limit. Wait a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    const t = await res.text();
    throw new Error(`AI gateway error: ${t.slice(0, 200)}`);
  }
  return res.json();
}

export const narratorTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { gameId: string; userPrompt?: string }) => {
    if (!data?.gameId) throw new Error("gameId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const userId = context.userId as string;

    const [{ data: game }, { data: chat }, { data: pokes }, { data: trainers }, { data: init }, { data: members }] = await Promise.all([
      supabase.from("games").select("id,name,narrator_type").eq("id", data.gameId).single(),
      supabase.from("chat_messages").select("kind,body,roll_data,created_at,user_id").eq("game_id", data.gameId).order("created_at", { ascending: false }).limit(40),
      supabase.from("pokemon").select("id,nickname,rank,current_hp,hp,current_attrs,species:species_id(name)").eq("game_id", data.gameId),
      supabase.from("trainers").select("id,name,rank,current_hp,attrs").eq("game_id", data.gameId),
      supabase.from("initiative").select("character_name,successes,position").eq("game_id", data.gameId).order("position"),
      supabase.from("game_members").select("user_id,role").eq("game_id", data.gameId),
    ]);
    if (!game) throw new Error("Game not found");

    const playerCount = ((members ?? []) as { role: string }[]).filter((m) => m.role === "player").length;

    const transcript = ((chat ?? []) as { kind: string; body: string; roll_data: { successes?: number; label?: string; dice?: number[] } | null }[])
      .slice().reverse()
      .map((m) => {
        if (m.kind === "roll" && m.roll_data) {
          const dice = m.roll_data.dice ? ` [${m.roll_data.dice.join(",")}]` : "";
          return `[ROLL] ${m.roll_data.label ?? m.body}: ${m.roll_data.successes ?? 0} successes${dice}`;
        }
        if (m.kind === "narrator") return `NARRATOR: ${m.body}`;
        return `PLAYER: ${m.body}`;
      }).join("\n");

    // RAG: pull top relevant rule passages.
    const ragQuery = data.userPrompt
      ?? (chat?.[0] as { body?: string } | undefined)?.body
      ?? game.name;
    const passages = await searchKnowledge(supabase, String(ragQuery), 6);
    const ragBlock = passages.length
      ? `RULEBOOK EXCERPTS (use as ground truth):\n${passages.map((p, i) => `[${i + 1}] ${p}`).join("\n\n")}`
      : "(No rulebook excerpts indexed — rely on core mechanics below.)";

    const partySummary = [
      "TRAINERS: " + ((trainers ?? []).map((t: { name: string; rank: string; current_hp: number | null; attrs: Record<string, number> }) =>
        `${t.name} (${t.rank}, HP ${t.current_hp ?? "?"}, Dex ${t.attrs?.dexterity ?? "?"})`).join("; ") || "none"),
      "POKÉMON: " + ((pokes ?? []).map((p: { nickname: string | null; rank: string; current_hp: number | null; hp: number; current_attrs: Record<string, number>; species: { name: string } | null }) =>
        `${p.nickname ?? p.species?.name ?? "?"} [${p.species?.name ?? "?"}] (${p.rank}, HP ${p.current_hp ?? p.hp}, Dex ${p.current_attrs?.dexterity ?? "?"})`).join("; ") || "none"),
    ].join("\n");

    const initSummary = (init ?? []).length === 0
      ? "No combat in progress."
      : "Current turn order:\n" + (init as { character_name: string; successes: number; position: number }[])
        .map((i) => `  ${i.position + 1}. ${i.character_name} (${i.successes})`).join("\n");

    const narratorMsgCount = ((chat ?? []) as { kind: string }[]).filter((m) => m.kind === "narrator").length;
    const isFirstTurn = narratorMsgCount === 0;

    const systemContent = `You are the AI Game Master for a Pokérole 2.0 session titled "${game.name as string}".

${ragBlock}

CORE MECHANICS (always apply):
${POKEROLE_RULES}

CURRENT PARTY STATE:
${partySummary}

LOBBY: ${playerCount} player(s) currently in the game.

INITIATIVE:
${initSummary}

YOUR ROLE — act like a real tabletop RPG narrator:
- Read the chat as living memory. ALWAYS verify [ROLL] entries: count the successes, apply pain penalty, narrate hits/misses based on the actual dice.
- ${isFirstTurn ? `THIS IS THE OPENING. First, greet the table, ASK how many players are joining today and what kind of adventure they want (mystery, gym challenge, exploration…). Tailor the opening scene to that answer. Do NOT spawn anything yet.` : `Continue the story. React to player actions and roll results in 2-4 vivid paragraphs.`}
- When creating an NPC trainer, CALL spawn_trainer (it builds the sheet & distributes points by rank).
- When a Pokémon appears (wild, NPC's, gifted starter), CALL spawn_wild_pokemon FIRST, then continue narrating.
- When combat begins, CALL start_combat with EVERY participant before describing it.
- Ask for the correct roll when a player attacks: Trainer = Dex + Brawl/Throw/Weapons; Pokémon = Dex + Brawl/Channel.
- Always end your reply with a clear prompt: "What do you do?", "Roll Dex + Brawl", etc.
- Stay warm, dramatic, concise (≤ 320 words). Portuguese if the players write in Portuguese.`;

    const userTurnContent = data.userPrompt?.trim()
      ? `Latest chat:\n${transcript}\n\nMost recent player input: ${data.userPrompt.trim()}`
      : `Latest chat:\n${transcript}\n\n(Continue the scene based on the most recent player activity.)`;

    let messages: Msg[] = [
      { role: "system", content: systemContent },
      { role: "user", content: userTurnContent },
    ];

    let finalText = "";
    for (let round = 0; round < 3; round++) {
      const json = await callGateway(messages);
      const choice = json?.choices?.[0]?.message;
      if (!choice) throw new Error("Empty AI response");
      const toolCalls = choice.tool_calls as { id: string; function: { name: string; arguments: string } }[] | undefined;
      if (!toolCalls || toolCalls.length === 0) {
        finalText = String(choice.content ?? "");
        break;
      }
      messages = [...messages, { role: "assistant", content: choice.content ?? "", tool_calls: toolCalls }];
      for (const tc of toolCalls) {
        let result: unknown;
        try {
          const args = JSON.parse(tc.function.arguments || "{}");
          if (tc.function.name === "spawn_wild_pokemon") result = await spawnWildPokemon(supabase, data.gameId, userId, args);
          else if (tc.function.name === "spawn_trainer") result = await spawnTrainer(supabase, data.gameId, userId, args);
          else if (tc.function.name === "start_combat") result = await startCombat(supabase, data.gameId, args.participants ?? []);
          else result = { ok: false, message: `Unknown tool ${tc.function.name}` };
        } catch (e) {
          result = { ok: false, message: e instanceof Error ? e.message : "Tool error" };
        }
        messages = [...messages, { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) }];
      }
    }

    if (!finalText.trim()) finalText = "*(The narrator pauses, gathering their thoughts.)*";

    await supabase.from("chat_messages").insert({
      game_id: data.gameId, user_id: userId, kind: "narrator", body: finalText,
    });
    return { content: finalText };
  });
