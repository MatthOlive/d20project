create or replace function public.match_knowledge(
  query_embedding vector(1536),
  match_count int default 6
)
returns table (id uuid, content text, source text, similarity float)
language sql stable
security invoker
set search_path = public
as $$
  select k.id, k.content, k.source,
         1 - (k.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks k
  order by k.embedding <=> query_embedding
  limit match_count;
$$;