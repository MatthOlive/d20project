import { createServerFn } from "@tanstack/react-start";

type NarratorMsg = { role: "system" | "user" | "assistant"; content: string };

export const narratorChat = createServerFn({ method: "POST" })
  .inputValidator((data: { messages: NarratorMsg[]; gameName?: string }) => {
    if (!data || !Array.isArray(data.messages)) {
      throw new Error("messages array required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are the AI Narrator (Game Master) for a Pokérole 2.0 tabletop RPG session${data.gameName ? ` titled "${data.gameName}"` : ""}.

Your role:
- Craft a living, evolving Pokémon world: vivid descriptions of routes, towns, wild encounters, gym leaders, weather, and NPCs.
- Narrate scenes in 2–4 short paragraphs, then ALWAYS end with a clear question to the players, e.g. "What do you want to do?" or "How do you respond?" — never wrap up a turn without prompting their next action.
- Track continuity from earlier messages (locations visited, NPCs met, choices made).
- When players describe an action, decide outcomes fairly: ask for dice rolls when there's meaningful risk (Pokérole 2.0 uses d6 pools; 4+ = success). Suggest the relevant Attribute + Skill.
- For combat, describe Pokémon moves cinematically and call for Accuracy + Damage rolls when appropriate.
- Introduce hooks, mysteries, and recurring villains. Reward creative ideas.
- Stay in character as a warm but dramatic narrator. Keep responses concise (≤ 250 words).

If this is the first message of the session, open with an evocative scene and ask the players who their trainers are and where they begin their adventure.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...data.messages],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("Rate limit exceeded. Please wait a moment.");
      if (response.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
      const t = await response.text();
      throw new Error(`AI gateway error: ${t.slice(0, 200)}`);
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    return { content: String(content) };
  });
