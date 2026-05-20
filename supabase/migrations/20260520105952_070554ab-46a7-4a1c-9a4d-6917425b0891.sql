create extension if not exists vector;

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'pokerole',
  chunk_index int not null default 0,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists knowledge_chunks_source_idx on public.knowledge_chunks(source);

alter table public.knowledge_chunks enable row level security;

create policy "knowledge readable by authenticated"
  on public.knowledge_chunks for select
  to authenticated using (true);

create or replace function public.match_knowledge(
  query_embedding vector(1536),
  match_count int default 6
)
returns table (id uuid, content text, source text, similarity float)
language sql stable
security definer
set search_path = public
as $$
  select k.id, k.content, k.source,
         1 - (k.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks k
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_knowledge(vector, int) to authenticated, service_role;