import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Knowledge: Pokérole 2.0 distilled from the rulebook ----------
const POKEROLE_RULES = `
POKÉROLE 2.0 — CORE MECHANICS (use these strictly)

DICE: Pools of d6. Each die showing 4, 5 or 6 = 1 success. Compare to a difficulty (1–5)
or to an opposing pool. Ties go to the defender.

ACTION ECONOMY: One round = one main action per character (move + attack, or a full
action like Defend / Help / use Item). Free actions (1-word, drop item) don't cost.
Initiative = Dexterity + Alert (roll d6 pool, count successes; highest acts first).

COMBAT:
- Accuracy roll = Accuracy Attribute + Accuracy Skill (in d6).
  Trainer attack skills: Brawl, Throw, or Weapons (with Dexterity).
  Pokémon attack skills: Brawl or Channel (with Dexterity).
- Each success beyond the defender's Evasion (Dex + Evasion) hits.
- Damage roll = Damage Stat + Move Power (in d6).
- Subtract target's Defense (Vitality, or Special for Special moves) from successes;
  remainder = HP lost. STAB grants +1 die when the move's type matches the user's.

HP & PAIN PENALTY:
- Trainer HP = 4 + Vitality. Pokémon HP = species base HP + Vitality.
- At ≤ half HP: every roll loses 1 success (penalty 1).
- At 1 HP: penalty becomes 2. At 0 HP: knocked out.

WILL: Max = Insight + 2. Spent for Channel abilities, resisting mental moves, pushing
through fear/charm/confusion. Restored by rest, meals, camaraderie.

CONFIDENCE / LOYALTY / HAPPINESS (0–5): Confidence is spent like Will to re-roll a die
or shrug off a status. Earned from victory and respecting Nature, lost from defeat or
mistreatment.

STATUS: Burn (−1 HP/round, −1 Str), Poison (1 HP/rd, ×2 after rd 3), Paralyzed (−1 die
on Dex pools), Sleep/Frozen (skip turn, wake on dmg), Confused (1–2 on d6 = hit random
target), Flinched (skip next action). Cured by rest, items, healing moves.

RANKS: Starter → Beginner → Amateur → Ace → Pro → Master. Each rank raises attribute
and skill caps and unlocks moves. The Narrator promotes the party at story beats.

MOVE-LEARNING CAP: A Pokémon knows at most (Insight + 2) moves.

EVOLUTION: At required Rank (or with item/stone) after a meaningful narrative moment.
A Pokémon may refuse — Loyalty rolls decide.

SOCIAL: Tough · Cool · Beautiful · Cute · Clever — used with Allure, Perform, Etiquette,
Intimidate for Contests and social conflict. Same d6 mechanics.

SKILLS (cap = current Rank tier):
Trainer-only: Brawl, Throw, Weapons.
Pokémon-only: Channel.
Shared: Clash, Evasion, Alert, Athletic, Nature, Stealth, Allure, Etiquette,
Intimidate, Perform, Crafts, Lore, Medicine, Science, Empathy.
`;

const RANK_ORDER = ["starter", "beginner", "amateur", "ace", "pro", "master"] as const;
type Rank = (typeof RANK_ORDER)[number];

// Bonus attribute points to distribute beyond species base, per rank step.
function bonusPointsForRank(rank: Rank): number {
  return Math.max(0, RANK_ORDER.indexOf(rank)) * 2;
}

function rollD6Pool(n: number) {
  const dice: number[] = [];
  for (let i = 0; i < Math.max(0, Math.min(50, n)); i++) {
    dice.push(1 + Math.floor(Math.random() * 6));
  }
  return { dice, successes: dice.filter((d) => d >= 4).length, ones: dice.filter((d) => d === 1).length };
}

// ============================================================================
// Tool implementations (run on the server, use the user's RLS-scoped client)
// ============================================================================

type SBClient = {
  // structural only – matches the supabase-js v2 surface we use here.
  from: (table: string) => {
    select: (cols?: string) => {
      eq: (col: string, v: unknown) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
        order: (col: string, opts?: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
        } & Promise<{ data: unknown; error: unknown }>;
        limit?: (n: number) => Promise<{ data: unknown; error: unknown }>;
      } & Promise<{ data: unknown; error: unknown }>;
      ilike?: (col: string, v: string) => { single: () => Promise<{ data: unknown; error: unknown }> } & Promise<{ data: unknown; error: unknown }>;
      order?: (col: string, opts?: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown; error: unknown }> } & Promise<{ data: unknown; error: unknown }>;
      limit?: (n: number) => Promise<{ data: unknown; error: unknown }>;
    };
    insert: (rows: unknown) => { select: () => { single: () => Promise<{ data: unknown; error: unknown }> } & Promise<{ data: unknown; error: unknown }> } & Promise<{ data: unknown; error: unknown }>;
    delete: () => { eq: (col: string, v: unknown) => Promise<{ error: unknown }> };
  };
};

async function spawnWildPokemon(
  supabase: SBClient,
  gameId: string,
  userId: string,
  params: { species: string; rank?: Rank; nickname?: string },
): Promise<{ ok: boolean; message: string; pokemon_id?: string; summary?: Record<string, unknown> }> {
  const rank = (params.rank ?? "starter") as Rank;
  // Find species by case-insensitive name.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: speciesData, error: sErr } = await (supabase as any)
    .from("species").select("*").ilike("name", params.species).limit(1);
  if (sErr || !speciesData || speciesData.length === 0) {
    return { ok: false, message: `Species "${params.species}" not found in the Pokédex.` };
  }
  const sp = speciesData[0] as {
    id: string; name: string; base_hp: number; base_attrs: Record<string, number>;
    attr_limits: Record<string, number>; abilities: string[]; sprite_url: string | null;
  };
  // Distribute bonus attribute points based on rank.
  const attrs: Record<string, number> = { ...sp.base_attrs };
  const limits = sp.attr_limits ?? {};
  let pts = bonusPointsForRank(rank);
  const keys = ["strength", "dexterity", "vitality", "special", "insight"];
  // Spread points round-robin while respecting limits.
  let safety = 100;
  while (pts > 0 && safety-- > 0) {
    let placed = false;
    for (const k of keys) {
      const cap = limits[k] ?? 5;
      const cur = attrs[k] ?? 1;
      if (cur < cap && pts > 0) { attrs[k] = cur + 1; pts -= 1; placed = true; }
    }
    if (!placed) break;
  }
  const vit = attrs.vitality ?? 1;
  const ins = attrs.insight ?? 1;
  const hp = sp.base_hp + vit;
  const will = ins + 2;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ins1, error: iErr } = await (supabase as any)
    .from("pokemon").insert({
      game_id: gameId, owner_id: userId, species_id: sp.id,
      nickname: params.nickname ?? null, rank,
      current_attrs: attrs, hp, will, current_hp: hp, current_will: will,
      image_url: sp.sprite_url, folder: "AI Encounters",
    }).select().single();
  if (iErr || !ins1) return { ok: false, message: `Failed to create Pokémon: ${String((iErr as { message?: string })?.message ?? "unknown")}` };
  const created = ins1 as { id: string };
  return {
    ok: true,
    pokemon_id: created.id,
    message: `Spawned wild ${sp.name} (Rank: ${rank}) — HP ${hp}, Will ${will}.`,
    summary: { species: sp.name, rank, attrs, hp, will, abilities: sp.abilities },
  };
}

async function startCombat(
  supabase: SBClient,
  gameId: string,
  participants: { name: string; dex?: number; alert?: number; character_kind?: string; character_ref?: string }[],
): Promise<{ ok: boolean; order: { name: string; successes: number; dice: number[] }[]; message: string }> {
  // Clear previous initiative for this game.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("initiative").delete().eq("game_id", gameId);
  const rolled = participants.map((p) => {
    const pool = Math.max(1, (p.dex ?? 2) + (p.alert ?? 1));
    const r = rollD6Pool(pool);
    return { name: p.name, kind: p.character_kind ?? "pokemon", character_ref: p.character_ref, successes: r.successes, dice: r.dice };
  });
  rolled.sort((a, b) => b.successes - a.successes);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserts = rolled.map((r, idx) => ({
    game_id: gameId,
    character_name: r.name,
    character_kind: r.kind,
    character_ref: r.character_ref ?? null,
    successes: r.successes,
    position: idx,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("initiative").insert(inserts);
  if (error) return { ok: false, order: [], message: `Failed to write initiative: ${String((error as { message?: string }).message)}` };
  return {
    ok: true,
    order: rolled.map((r) => ({ name: r.name, successes: r.successes, dice: r.dice })),
    message: `Combat started. Turn order: ${rolled.map((r, i) => `${i + 1}. ${r.name} (${r.successes})`).join(" → ")}`,
  };
}

// ============================================================================
// Server function — narratorTurn
// Reads chat + game state, calls AI Gateway with tools, executes tool calls,
// posts the final narrator message into chat_messages.
// ============================================================================

const TOOLS = [
  {
    type: "function",
    function: {
      name: "spawn_wild_pokemon",
      description: "Create a wild Pokémon sheet for an encounter, using the database species data. Use this whenever a wild Pokémon appears or you are starting combat with one. Rank defaults to starter; raise it if the encounter should be tougher.",
      parameters: {
        type: "object",
        properties: {
          species: { type: "string", description: "Exact Pokédex name, e.g. Pikachu, Bulbasaur." },
          rank: { type: "string", enum: ["starter", "beginner", "amateur", "ace", "pro", "master"], description: "Power tier of the encounter." },
          nickname: { type: "string", description: "Optional display name." },
        },
        required: ["species"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_combat",
      description: "Roll initiative (Dex + Alert in d6s, 4+ = success) for every participant and open the turn order. Call this the moment combat begins. Include trainers, party Pokémon and wild Pokémon. character_ref is optional but pass it if you know the Pokémon/trainer id (e.g. one you just spawned).",
      parameters: {
        type: "object",
        properties: {
          participants: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                dex: { type: "number", description: "Dexterity (1–5)." },
                alert: { type: "number", description: "Alert skill (0–5)." },
                character_kind: { type: "string", enum: ["pokemon", "trainer", "wild"] },
                character_ref: { type: "string", description: "Optional id of an existing pokemon/trainer row." },
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
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("AI rate limit. Wait a moment and try again.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
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

    // Load game + recent chat + characters + initiative for context.
    const [{ data: game }, { data: chat }, { data: pokes }, { data: trainers }, { data: init }] = await Promise.all([
      supabase.from("games").select("id,name,narrator_type").eq("id", data.gameId).single(),
      supabase.from("chat_messages").select("kind,body,roll_data,created_at,user_id").eq("game_id", data.gameId).order("created_at", { ascending: false }).limit(30),
      supabase.from("pokemon").select("id,nickname,rank,current_hp,hp,current_attrs,species:species_id(name)").eq("game_id", data.gameId),
      supabase.from("trainers").select("id,name,rank,current_hp,attrs").eq("game_id", data.gameId),
      supabase.from("initiative").select("character_name,successes,position").eq("game_id", data.gameId).order("position"),
    ]);
    if (!game) throw new Error("Game not found");

    // Build chat transcript (oldest first).
    const transcript = ((chat ?? []) as { kind: string; body: string; roll_data: { successes?: number; label?: string } | null }[])
      .slice().reverse()
      .map((m) => {
        if (m.kind === "roll" && m.roll_data) {
          return `[ROLL] ${m.roll_data.label ?? m.body}: ${m.roll_data.successes ?? 0} successes`;
        }
        if (m.kind === "narrator") return `NARRATOR: ${m.body}`;
        return `PLAYER: ${m.body}`;
      })
      .join("\n");

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

    const systemContent = `You are the AI Game Master for a Pokérole 2.0 session titled "${game.name as string}".

${POKEROLE_RULES}

CURRENT PARTY STATE:
${partySummary}

INITIATIVE:
${initSummary}

YOUR JOB:
- Read the chat as the session's living memory and continue the story.
- Respond in 2-4 short paragraphs of vivid prose, ALWAYS ending with a clear prompt to the players ("What do you do?", "How do you respond?").
- When combat starts, you MUST call start_combat with every participant (use the dex/alert values from CURRENT PARTY STATE).
- If a wild Pokémon appears, call spawn_wild_pokemon FIRST (its sheet shows up in the Files panel), then call start_combat including it.
- For damaging moves, ask players to roll the right Attribute + Skill (see rules above). Trainer attacks: Dex + Brawl/Throw/Weapons. Pokémon attacks: Dex + Brawl/Channel. Subtract pain penalty when HP is low.
- Stay in character. Be warm, dramatic, concise (≤ 280 words).
- If this is the very first turn, set the opening scene and ask the players who they are and where they begin.`;

    const userTurnContent = data.userPrompt?.trim()
      ? `Latest chat:\n${transcript}\n\nPLAYER (just now): ${data.userPrompt.trim()}`
      : `Latest chat:\n${transcript}\n\n(The players are waiting for your next beat. Continue the scene.)`;

    let messages: Msg[] = [
      { role: "system", content: systemContent },
      { role: "user", content: userTurnContent },
    ];

    // Tool loop — allow up to 3 rounds of tool calls before final answer.
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
      // Append assistant message with tool_calls and execute each.
      messages = [...messages, { role: "assistant", content: choice.content ?? "", tool_calls: toolCalls }];
      for (const tc of toolCalls) {
        let result: unknown;
        try {
          const args = JSON.parse(tc.function.arguments || "{}");
          if (tc.function.name === "spawn_wild_pokemon") {
            result = await spawnWildPokemon(supabase, data.gameId, userId, args);
          } else if (tc.function.name === "start_combat") {
            result = await startCombat(supabase, data.gameId, args.participants ?? []);
          } else {
            result = { ok: false, message: `Unknown tool ${tc.function.name}` };
          }
        } catch (e) {
          result = { ok: false, message: e instanceof Error ? e.message : "Tool error" };
        }
        messages = [...messages, { role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) }];
      }
    }

    if (!finalText.trim()) finalText = "*(The narrator pauses, gathering their thoughts.)*";

    // Post the narrator's prose as a chat message so all players see it.
    await supabase.from("chat_messages").insert({
      game_id: data.gameId,
      user_id: userId,
      kind: "narrator",
      body: finalText,
    });

    return { content: finalText };
  });
