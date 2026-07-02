# Checklist para sair do Lovable

## Dependencias

- [x] Remover `@lovable.dev/cloud-auth-js`.
- [x] Remover `@lovable.dev/vite-tanstack-config`.
- [ ] Substituir `vite.config.ts` por config Vite/TanStack propria.
- [ ] Conferir se Cloudflare plugin ainda sera usado ou se o deploy vai para Vercel/Netlify.

## Autenticacao

- [x] Trocar `src/integrations/lovable/index.ts` por OAuth direto do Supabase.
- [ ] Atualizar `src/routes/auth.tsx` para usar `supabase.auth.signInWithOAuth`.
- [ ] Configurar redirect URLs no Supabase novo:
  - URL de producao web.
  - URL de preview/staging.
  - localhost.
- [ ] Testar email/senha.
- [ ] Testar Google OAuth.

## IA

- [ ] Trocar `LOVABLE_API_KEY` por `AI_GATEWAY_API_KEY` ou chave do provedor escolhido.
- [ ] Trocar `https://ai.gateway.lovable.dev/v1/chat/completions`.
- [ ] Trocar `https://ai.gateway.lovable.dev/v1/embeddings`.
- [ ] Manter RAG por `knowledge_chunks`.
- [ ] Separar prompts por sistema: Pokérole e Tormenta 20.

## URLs publicas

- [ ] Trocar canonical/metadata em:
  - `src/routes/__root.tsx`
  - `src/routes/index.tsx`
  - `src/routes/auth.tsx`
  - `src/routes/_app.dashboard.tsx`
  - `src/routes/sitemap[.]xml.ts`
- [ ] Criar variavel `VITE_PUBLIC_APP_URL`.

## Supabase proprio

- [ ] Criar projeto Supabase novo.
- [ ] Rodar migrations em ordem.
- [ ] Criar buckets:
  - `pokerole2`
  - mapas/backgrounds
  - personagens/tokens
  - handouts
  - regras/pdf
- [ ] Habilitar Realtime nas tabelas usadas pela mesa.
- [ ] Conferir RLS de tokens para jogadores/editors.
- [ ] Conferir RLS de T20.

## PWA

- [x] Manifest inicial.
- [x] Icones iniciais.
- [x] Service worker inicial.
- [ ] Ajustar estrategia de cache para nao cachear APIs Supabase.
- [ ] Testar instalacao Android.
- [ ] Testar instalacao Windows.
- [ ] Criar UI de "Instalar app" opcional.

## Realtime/performance

- [ ] Throttle de movimento de token.
- [ ] Estado otimista para drag.
- [ ] Indicador de conexao.
- [ ] Reconexao de canais Supabase.
- [ ] Teste com 2 navegadores e 1 PWA instalado na mesma mesa.

## Migracao de dados

- [ ] Exportar dados do Supabase atual.
- [ ] Importar para Supabase novo.
- [ ] Validar campanhas.
- [ ] Validar fichas Pokérole.
- [ ] Validar fichas T20.
- [ ] Validar mapas/tokens.
- [ ] Validar storage URLs.
