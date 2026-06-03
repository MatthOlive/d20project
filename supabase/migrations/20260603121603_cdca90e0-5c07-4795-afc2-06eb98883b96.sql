-- Scope knowledge_chunks to the narrator who ingested them
ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS owner_id uuid;
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_owner_source ON public.knowledge_chunks(owner_id, source);