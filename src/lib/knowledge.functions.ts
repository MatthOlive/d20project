import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";


// Chunk text into ~1200-char passages with 200-char overlap.
function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + size);
    chunks.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - overlap;
  }
  return chunks;
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: inputs,
      dimensions: 1536,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Embedding gateway error ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

/**
 * Ingest a raw text document (already extracted from a PDF on the client)
 * into the knowledge_chunks table. Only narrators of any game may ingest.
 */
export const ingestKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      source: z.string().min(1).max(120).default("pokerole"),
      text: z.string().min(20).max(2_000_000),
      replace: z.boolean().optional().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {


    // Only allow ingest if the caller is a narrator of at least one game.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const { data: games } = await supabase
      .from("games").select("id").eq("narrator_id", context.userId).limit(1);
    if (!games || games.length === 0) {
      throw new Error("Only a narrator can ingest knowledge.");
    }

    const chunks = chunkText(data.text);
    if (chunks.length === 0) return { ok: true, inserted: 0 };

    // pgvector expects embeddings as a string like "[0.1,0.2,...]" via supabase-js.
    const rows: { source: string; chunk_index: number; content: string; embedding: string; owner_id: string }[] = [];
    for (let i = 0; i < chunks.length; i += 50) {
      const batch = chunks.slice(i, i + 50);
      const embeds = await embedBatch(batch);
      embeds.forEach((emb, j) =>
        rows.push({
          source: data.source,
          chunk_index: i + j,
          content: batch[j],
          embedding: `[${emb.join(",")}]`,
          owner_id: context.userId,
        }),
      );
    }

    if (data.replace) {
      // Only replace rows owned by the caller — never overwrite another narrator's data.
      await supabaseAdmin
        .from("knowledge_chunks")
        .delete()
        .eq("source", data.source)
        .eq("owner_id", context.userId);
    }

    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const slice = rows.slice(i, i + 200);
      const { error } = await supabaseAdmin.from("knowledge_chunks").insert(slice);
      if (error) throw new Error(`Insert failed: ${error.message}`);
      inserted += slice.length;
    }
    return { ok: true, inserted };
  });


export const deleteKnowledgeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ source: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = context.supabase as any;
    const { data: games } = await supabase
      .from("games").select("id").eq("narrator_id", context.userId).limit(1);
    if (!games || games.length === 0) throw new Error("Only a narrator can delete knowledge.");
    const { error } = await supabaseAdmin
      .from("knowledge_chunks")
      .delete()
      .eq("source", data.source)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Internal: top-k semantic search of the rulebook. */
export async function searchKnowledge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  query: string,
  k = 6,
  source?: string,
): Promise<string[]> {
  try {
    const [embedding] = await embedBatch([query]);
    const { data, error } = await supabase.rpc("match_knowledge", {
      query_embedding: `[${embedding.join(",")}]`,
      match_count: source ? Math.max(k * 4, 24) : k,
    });
    if (error || !data) return [];
    return (data as { content: string; source?: string }[])
      .filter((r) => !source || r.source === source)
      .slice(0, k)
      .map((r) => r.content);
  } catch {
    return [];
  }
}
