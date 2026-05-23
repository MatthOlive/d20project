import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchKnowledge } from "./knowledge.functions";

// ---------- Knowledge: Pokérole 2.0 core mechanics (fallback when no RAG hits) ----------
const POKEROLE_RULES = `
POKÉROLE 2.0 — CORE MECHANICS

DICE: Pools of d6. 4/5/6 = success. Difficulty 1–5 or opposed.
INITIATIVE: Dexterity + Alert (count successes; highest acts first).
ACCURACY (always rolled FIRST): Accuracy Attribute + Accuracy Skill in d6.
  Trainer attacks: Dexterity + Brawl/Throw/Weapons.
  Pokémon attacks: Dexterity + Brawl/Channel.
  Defender's Evasion = Dex + Evasion.
DAMAGE (rolled SECOND, ONLY if Accuracy hits): Damage Stat + Move Power in d6.
  STAB = +1 die when the move type matches a user's type.
  Subtract target's Defense (Vitality) or Sp.Def (Insight on Pokémon) DICE from the damage pool BEFORE rolling.
HP: Trainer = 4 + Vitality. Pokémon = species base HP + Vitality.
PAIN PENALTY: ≤ half HP = −1 success on all rolls. 1 HP = −2.
WILL: Max = Insight + 2.

RANKS — official point distribution (cumulative across rank up):
  Pokémon attribute points (over starter baseline): starter 0, beginner +2, amateur +4, ace +6, pro +8, master +10.
  Pokémon social points: same scale starter 0 to master +10.
  Trainer = rank points (same) + AGE bonus.
  Skill points: starter 5, beginner 10, amateur 15, ace 20, pro 25, master 30.
  Skill cap per rank: 1 / 2 / 3 / 4 / 5 / 5.
TRAINER AGE bonus:
  child:    +0 physical / +0 social
  young:    +2 physical / +2 social
  adult:    +4 physical / +4 social
  veteran:  +3 physical / +6 social
MOVES KNOWN: Insight + 2.
`;

const RANK_ORDER = ["starter", "beginner", "amateur", "ace", "pro", "master"] as const;
type Rank = (typeof RANK_ORDER)[number];

// Official Pokérole 2.0 distribution per rank.
// attrPoints = ADDITIONAL points beyond starter baseline (the species/base trainer already has its starting stats).
const RANK_TABLE: Record<Rank, { attrPoints: number; socialPoints: number; skillPoints: number; skillCap: number; attrCap: number }> = {
  starter:  { attrPoints: 0,  socialPoints: 0,  skillPoints: 5,  skillCap: 1, attrCap: 3 },
  beginner: { attrPoints: 2,  socialPoints: 2,  skillPoints: 10, skillCap: 2, attrCap: 4 },
  amateur:  { attrPoints: 4,  socialPoints: 4,  skillPoints: 15, skillCap: 3, attrCap: 4 },
  ace:      { attrPoints: 6,  socialPoints: 6,  skillPoints: 20, skillCap: 4, attrCap: 5 },
  pro:      { attrPoints: 8,  socialPoints: 8,  skillPoints: 25, skillCap: 5, attrCap: 5 },
  master:   { attrPoints: 10, socialPoints: 10, skillPoints: 30, skillCap: 5, attrCap: 5 },
};

const AGE_TABLE: Record<string, { phys: number; social: number }> = {
  child:   { phys: 0, social: 0 },
  young:   { phys: 2, social: 2 },
  adult:   { phys: 4, social: 4 },
  veteran: { phys: 3, social: 6 },
};

const POKEMON_ATTR_KEYS = ["strength", "dexterity", "vitality", "special", "insight"];
const TRAINER_ATTR_KEYS = ["strength", "dexterity", "vitality", "insight"];
const SOCIAL_KEYS = ["tough", "cool", "beautiful", "cute", "clever"];
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

// Distribute `points` across `keys`, respecting per-key `cap`. `importance: random` uses uniform shuffle,
// `themed` weighs preferred keys ~60/40.
function distributePoints(
  base: Record<string, number>,
  keys: string[],
  points: number,
  capFn: (key: string) => number,
  importance: "random" | "themed" = "random",
  preferred: string[] = [],
): Record<string, number> {
  const out: Record<string, number> = { ...base };
  for (const k of keys) if (out[k] == null) out[k] = 0;
  let remaining = Math.max(0, Math.floor(points));
  const pref = preferred.filter((k) => keys.includes(k));
  let safety = 500;
  while (remaining > 0 && safety-- > 0) {
    // pick a candidate key
    let pool: string[];
    if (importance === "themed" && pref.length > 0 && Math.random() < 0.6) {
      pool = pref.filter((k) => out[k] < capFn(k));
    } else {
      pool = keys.filter((k) => out[k] < capFn(k));
    }
    if (pool.length === 0) {
      // fallback to full pool
      pool = keys.filter((k) => out[k] < capFn(k));
      if (pool.length === 0) break;
    }
    const choice = pool[Math.floor(Math.random() * pool.length)];
    out[choice] = (out[choice] ?? 0) + 1;
    remaining -= 1;
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SBClient = any;

async function findExistingAiCharacter(
  supabase: SBClient,
  gameId: string,
  table: "pokemon" | "trainers",
  match: { species_id?: string; name?: string },
): Promise<{ id: string } | null> {
  let q = supabase.from(table).select("id").eq("game_id", gameId).eq("ai_spawned", true);
  if (table === "pokemon" && match.species_id) q = q.eq("species_id", match.species_id);
  if (table === "trainers" && match.name) q = q.ilike("name", match.name);
  // Only reuse if combat (initiative) is currently active OR sheet was created < 30 min ago.
  const { data } = await q.limit(1);
  if (data && data.length > 0) return { id: data[0].id as string };
  return null;
}

async function spawnWildPokemon(
  supabase: SBClient,
  gameId: string,
  userId: string,
  params: {
    species: string; rank?: Rank; nickname?: string;
    importance?: "random" | "themed";
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

  // Reuse an existing AI-spawned sheet for the same species in this game.
  const existing = await findExistingAiCharacter(supabase, gameId, "pokemon", { species_id: sp.id });
  if (existing) {
    return {
      ok: true, pokemon_id: existing.id,
      message: `Reusing existing ${sp.name} sheet (id ${existing.id}). Do NOT create a new one — refer to it by name in narration.`,
      summary: { reused: true, species: sp.name },
    };
  }

  const limits = sp.attr_limits ?? {};
  const importance = params.importance ?? "random";
  const baseAttrs: Record<string, number> = {};
  for (const k of POKEMON_ATTR_KEYS) baseAttrs[k] = sp.base_attrs?.[k] ?? 1;
  const attrs = distributePoints(
    baseAttrs, POKEMON_ATTR_KEYS, tbl.attrPoints,
    (k) => Math.min(limits[k] ?? 5, tbl.attrCap),
    importance, params.preferred_attrs,
  );
  const social = distributePoints(
    { tough: 1, cool: 1, beautiful: 1, cute: 1, clever: 1 },
    SOCIAL_KEYS, tbl.socialPoints, () => tbl.attrCap, importance,
  );
  const skills = distributePoints(
    {}, POKEMON_SKILL_KEYS, tbl.skillPoints,
    () => tbl.skillCap, importance, params.preferred_skills,
  );

  const hp = sp.base_hp + (attrs.vitality ?? 1);
  const will = (attrs.insight ?? 1) + 2;

  const { data: ins1, error: iErr } = await supabase
    .from("pokemon").insert({
      game_id: gameId, owner_id: userId, species_id: sp.id,
      nickname: params.nickname ?? null, rank,
      current_attrs: attrs, social_attrs: social, skills,
      hp, will, current_hp: hp, current_will: will,
      image_url: sp.sprite_url, folder: "AI Encounters",
      ai_spawned: true,
    }).select().single();
  if (iErr || !ins1) return { ok: false, message: `Failed to create Pokémon: ${String(iErr?.message ?? "unknown")}` };
  return {
    ok: true, pokemon_id: ins1.id,
    message: `Spawned ${sp.name} (${rank}) — HP ${hp}, Will ${will}. Use THIS sheet for the entire combat — do not spawn another.`,
    summary: { species: sp.name, rank, attrs, skills, social, hp, will, abilities: sp.abilities },
  };
}

async function spawnTrainer(
  supabase: SBClient,
  gameId: string,
  userId: string,
  params: {
    name: string; rank?: Rank; concept?: string; nature?: string;
    age_group?: "child" | "young" | "adult" | "veteran";
    importance?: "random" | "themed";
    preferred_attrs?: string[]; preferred_skills?: string[];
  },
): Promise<{ ok: boolean; message: string; trainer_id?: string; summary?: Record<string, unknown> }> {
  const rank = (params.rank ?? "starter") as Rank;
  const tbl = RANK_TABLE[rank];
  const age = AGE_TABLE[params.age_group ?? "young"] ?? AGE_TABLE.young;

  // Reuse same-name trainer the AI already created in this game.
  const existing = await findExistingAiCharacter(supabase, gameId, "trainers", { name: params.name });
  if (existing) {
    return {
      ok: true, trainer_id: existing.id,
      message: `Reusing existing trainer "${params.name}" (id ${existing.id}). Do NOT create another.`,
      summary: { reused: true, name: params.name },
    };
  }

  const importance = params.importance ?? "random";
  const baseAttrs: Record<string, number> = { strength: 1, dexterity: 1, vitality: 1, insight: 1 };
  const physPoints = tbl.attrPoints + age.phys;
  const socialPoints = tbl.socialPoints + age.social;
  const attrs = distributePoints(
    baseAttrs, TRAINER_ATTR_KEYS, physPoints,
    () => tbl.attrCap, importance, params.preferred_attrs,
  );
  const social = distributePoints(
    { tough: 1, cool: 1, beautiful: 1, cute: 1, clever: 1 },
    SOCIAL_KEYS, socialPoints, () => tbl.attrCap, importance,
  );
  const skills = distributePoints(
    {}, TRAINER_SKILL_KEYS, tbl.skillPoints,
    () => tbl.skillCap, importance, params.preferred_skills,
  );
  const hp = 4 + (attrs.vitality ?? 1);
  const will = (attrs.insight ?? 1) + 2;

  const { data, error } = await supabase
    .from("trainers").insert({
      game_id: gameId, owner_id: userId, name: params.name, rank,
      concept: params.concept ?? null, nature: params.nature ?? null,
      attrs, social_attrs: social, skills,
      current_hp: hp, current_will: will,
      folder: "NPCs", ai_spawned: true,
    }).select().single();
  if (error || !data) return { ok: false, message: `Failed to create trainer: ${String(error?.message ?? "unknown")}` };
  return {
    ok: true, trainer_id: data.id,
    message: `Created trainer ${params.name} (${rank}, age=${params.age_group ?? "young"}) — HP ${hp}, Will ${will}.`,
    summary: { name: params.name, rank, attrs, social, skills, hp, will },
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
      description: "Create a Pokémon sheet in the Files panel using the database Pokédex. If a Pokémon with this species was already AI-spawned in this game, REUSE that sheet automatically — do not create duplicates. Distributes attribute, social, and skill points according to the official Pokérole rank table.",
      parameters: {
        type: "object",
        properties: {
          species: { type: "string", description: "Exact Pokédex name (e.g. Pikachu)." },
          rank: { type: "string", enum: RANK_ORDER as unknown as string[] },
          nickname: { type: "string" },
          importance: { type: "string", enum: ["random", "themed"], description: "Use 'random' for wild/throwaway encounters. Use 'themed' for gym leaders, rivals, recurring NPCs — also pass preferred_attrs/preferred_skills." },
          preferred_attrs: { type: "array", items: { type: "string", enum: POKEMON_ATTR_KEYS } },
          preferred_skills: { type: "array", items: { type: "string", enum: POKEMON_SKILL_KEYS } },
        },
        required: ["species"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "spawn_trainer",
      description: "Create an NPC Trainer sheet. Distributes points by rank + age. REUSES an existing same-name AI trainer if present.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          rank: { type: "string", enum: RANK_ORDER as unknown as string[] },
          age_group: { type: "string", enum: ["child", "young", "adult", "veteran"], description: "Determines extra physical/social points on top of rank." },
          concept: { type: "string" },
          nature: { type: "string" },
          importance: { type: "string", enum: ["random", "themed"] },
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
      model: "google/gemini-2.5-pro",
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

const LANG_INSTRUCTION: Record<string, string> = {
  "pt-BR": "Responda SEMPRE em português brasileiro. Mantenha em inglês apenas nomes próprios de Pokémon, moves, abilities e naturezas.",
  "en": "Respond in English. Keep Pokémon/move/ability names in English.",
  "es": "Responde SIEMPRE en español. Mantén en inglés solo los nombres propios de Pokémon, moves, abilities y naturezas.",
};

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
      supabase.from("games").select("id,name,narrator_type,language").eq("id", data.gameId).single(),
      supabase.from("chat_messages").select("kind,body,roll_data,created_at,user_id").eq("game_id", data.gameId).order("created_at", { ascending: false }).limit(40),
      supabase.from("pokemon").select("id,nickname,rank,current_hp,hp,current_attrs,ai_spawned,species:species_id(name)").eq("game_id", data.gameId),
      supabase.from("trainers").select("id,name,rank,current_hp,attrs,ai_spawned").eq("game_id", data.gameId),
      supabase.from("initiative").select("character_name,successes,position").eq("game_id", data.gameId).order("position"),
      supabase.from("game_members").select("user_id,role").eq("game_id", data.gameId),
    ]);
    if (!game) throw new Error("Game not found");

    const playerCount = ((members ?? []) as { role: string }[]).filter((m) => m.role === "player").length;
    const lang = (game.language as string) || "pt-BR";
    const langDirective = LANG_INSTRUCTION[lang] ?? LANG_INSTRUCTION["en"];

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

    const ragQuery = data.userPrompt
      ?? (chat?.[0] as { body?: string } | undefined)?.body
      ?? game.name;
    const passages = await searchKnowledge(supabase, String(ragQuery), 6);
    const ragBlock = passages.length
      ? `RULEBOOK EXCERPTS (use as ground truth):\n${passages.map((p, i) => `[${i + 1}] ${p}`).join("\n\n")}`
      : "(No rulebook excerpts indexed — rely on core mechanics below.)";

    const aiSheets = [
      ...((pokes ?? []) as { ai_spawned: boolean; nickname: string | null; species: { name: string } | null }[])
        .filter((p) => p.ai_spawned)
        .map((p) => `pokemon:${p.nickname ?? p.species?.name ?? "?"}`),
      ...((trainers ?? []) as { ai_spawned: boolean; name: string }[])
        .filter((t) => t.ai_spawned)
        .map((t) => `trainer:${t.name}`),
    ];

    const partySummary = [
      "TRAINERS: " + ((trainers ?? []).map((t: { name: string; rank: string; current_hp: number | null; attrs: Record<string, number> }) =>
        `${t.name} (${t.rank}, HP ${t.current_hp ?? "?"}, Dex ${t.attrs?.dexterity ?? "?"})`).join("; ") || "none"),
      "POKÉMON: " + ((pokes ?? []).map((p: { nickname: string | null; rank: string; current_hp: number | null; hp: number; current_attrs: Record<string, number>; species: { name: string } | null }) =>
        `${p.nickname ?? p.species?.name ?? "?"} [${p.species?.name ?? "?"}] (${p.rank}, HP ${p.current_hp ?? p.hp}, Dex ${p.current_attrs?.dexterity ?? "?"})`).join("; ") || "none"),
      "AI-SPAWNED SHEETS (already exist — REUSE, do not duplicate): " + (aiSheets.join(", ") || "none"),
    ].join("\n");

    const initSummary = (init ?? []).length === 0
      ? "No combat in progress."
      : "Current turn order:\n" + (init as { character_name: string; successes: number; position: number }[])
        .map((i) => `  ${i.position + 1}. ${i.character_name} (${i.successes})`).join("\n");

    const narratorMsgCount = ((chat ?? []) as { kind: string }[]).filter((m) => m.kind === "narrator").length;
    const isFirstTurn = narratorMsgCount === 0;

    const systemContent = `You are the AI Game Master for a Pokérole 2.0 session titled "${game.name as string}".

LANGUAGE: ${langDirective}

${ragBlock}

CORE MECHANICS (always apply):
${POKEROLE_RULES}

CURRENT PARTY STATE:
${partySummary}

LOBBY: ${playerCount} player(s) currently in the game.

INITIATIVE:
${initSummary}

YOUR ROLE — act like a real tabletop RPG narrator:
- Read the chat as living memory. ALWAYS verify [ROLL] entries.
- ROLL ORDER: every attack produces TWO rolls in sequence — first "· Accuracy" then "· Damage". A move ONLY deals damage if the Accuracy roll exceeded the target's evasion. NEVER narrate damage before reading the matching "· Damage" entry; treat a missing damage roll as "the attack missed" unless context says otherwise.
- ${isFirstTurn ? `THIS IS THE OPENING. Greet the table, ASK how many players are joining today and what kind of adventure they want. Tailor the opening scene to that answer. Do NOT spawn anything yet.` : `Continue the story. React to player actions and roll results in 2-4 vivid paragraphs.`}
- BEFORE calling spawn_wild_pokemon or spawn_trainer, CHECK the "AI-SPAWNED SHEETS" list above. If the creature/NPC is already there, REUSE it — refer to it by name and DO NOT call the spawn tool again. The same Caterpie said three times is ONE Caterpie.
- When creating an NPC trainer, CALL spawn_trainer (sheet + points by rank+age).
- For wild encounters use importance="random". For gym leaders / rivals / recurring villains use importance="themed" with preferred_attrs & preferred_skills that fit the concept (e.g. Fire-type gym leader → preferred_attrs:["special","insight"], preferred_skills:["Channel","Lore"]).
- When combat begins, CALL start_combat with EVERY participant before describing it.
- Ask for the correct roll when a player attacks: Trainer = Dex + Brawl/Throw/Weapons; Pokémon = Dex + Brawl/Channel.
- Always end your reply with a clear prompt.
- Stay warm, dramatic, concise (≤ 320 words).`;

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
