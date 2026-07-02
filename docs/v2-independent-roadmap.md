# D20 Project V2 independente

Este plano transforma o projeto atual em uma versao web + instalavel, usando Supabase proprio e sem dependencia operacional do Lovable.

## Objetivo

- Uma unica base de dados Supabase controlada pelo dono do sistema.
- Jogadores no navegador e no app instalado jogando na mesma mesa em tempo real.
- Mesma conta, mesmas campanhas, mesmos mapas, fichas, rolagens, chat e tokens.
- Web app publicado fora do Lovable.
- PWA instalavel como primeira versao do app instalado.
- Desktop com Tauri/Electron apenas depois que a web/PWA estiver estavel.

## Arquitetura alvo

```text
apps/
  web-pwa
shared/
  auth
  realtime
  map
  chat
  ui
systems/
  pokerole
  tormenta20
supabase/
  migrations
  seed
  functions
```

Na primeira etapa, nao e necessario mover todos os arquivos para essa estrutura. A prioridade e desacoplar Lovable, estabilizar o banco e publicar a web independente.

## Backend

Usar um projeto Supabase proprio:

- Auth: email/senha e OAuth configurado diretamente no Supabase.
- Database: migrations versionadas em `supabase/migrations`.
- Realtime: tabelas de chat, tokens, iniciativa, fichas, mapas e musica.
- Storage: imagens de mapas, personagens, handouts e PDFs de regras.
- Edge/server functions: IA, YouTube e ingestao de PDF podem continuar no servidor, mas sem gateway Lovable.

## Variaveis

Usar `.env.example` como base:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
AI_GATEWAY_API_KEY
YOUTUBE_API_KEY
```

## Fases

### Fase 1: Web independente

1. Criar Supabase novo.
2. Rodar todas as migrations.
3. Criar buckets de storage.
4. Trocar variaveis do app para o Supabase novo.
5. Remover `@lovable.dev/cloud-auth-js` do login OAuth.
6. Substituir `LOVABLE_API_KEY` por provedor proprio de IA.
7. Publicar em Vercel, Netlify, Cloudflare Pages ou servidor proprio.

### Fase 2: PWA instalavel

Ja existe base inicial:

- `public/manifest.webmanifest`
- `public/sw.js`
- icones PWA
- registro de service worker em producao

Proximos ajustes:

1. Melhorar cache apenas para shell/assets.
2. Nao cachear chamadas Supabase.
3. Criar prompt visual "Instalar app".
4. Testar instalacao em Android, Windows e desktop Chrome/Edge.

### Fase 3: Realtime robusto

1. Token drag com atualizacao local imediata.
2. Persistencia com throttle.
3. Reconciliacao quando outro usuario move o mesmo token.
4. Aviso de reconexao quando Supabase Realtime cair.
5. Indicador de latencia simples no canto da mesa.

### Fase 4: Sistemas modularizados

Separar regras por sistema:

```text
src/systems/pokerole
src/systems/tormenta20
src/shared
```

Cada sistema deve definir:

- ficha
- rolagens
- compendio
- catalogos
- token actions
- criacao de personagem

### Fase 5: Desktop opcional

So depois da PWA:

- Tauri se quiser app leve.
- Electron se quiser ecossistema web mais simples.
- Ambos usando o mesmo Supabase.

## Pontos que ainda prendem ao Lovable

- `@lovable.dev/vite-tanstack-config`
- `@lovable.dev/cloud-auth-js`
- `LOVABLE_API_KEY`
- `https://ai.gateway.lovable.dev`
- URLs canonicas `d20project.lovable.app`
- Mensagens antigas em comentarios/metadata.

## Estrategia recomendada

Nao reescrever tudo de uma vez.

1. Fazer a web independente funcionar.
2. Ativar PWA.
3. Migrar banco/dados.
4. Modularizar sistemas aos poucos.
5. Criar desktop se ainda houver necessidade real.
