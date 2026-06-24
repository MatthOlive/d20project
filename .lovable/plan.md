# Status do roadmap de mapa (paridade Roll20)

## Concluído nesta resposta

### Fase 1 — Camadas (toggles)
- `MapBoard`: narrador agora tem 3 toggles na toolbar (camada GM, Backgrounds, Tokens). Hide é só local (não afeta jogadores).

### Fase 3 — Páginas reais (multi-mapa) ✅
- Migração: `page_id` em `tokens`, `map_drawings`, `fog_regions`, `walls`, `map_backgrounds`. `games.active_page_id` (página que os jogadores vêem). Backfill atribui tudo à primeira cena de cada mesa; mesas sem cena ganham "Página 1" automaticamente. `page_id` é NOT NULL com índice.
- `MapBoard`: prop `activePageId`; estado interno `viewingPageId`. Narrador pode visualizar outra página sem afetar jogadores; jogador sempre acompanha `active_page_id` via realtime. Todas as queries/inserts/realtime de tokens/drawings/fog/walls/backgrounds filtram e gravam por `page_id`.
- Novo `PageSwitcher` (canto sup. esq., só narrador): lista as cenas, "Visualizar" (local), "Tornar ativa" (broadcast), criar/renomear/excluir página.
- `sendRowToMap` (FilesPanel) lê `active_page_id` e grava token na página correta.

## Pendências do roadmap

- **Decks de cartas** completos (hoje só `REACTION_DECK` fechado).
- **Importar mapa por grid/tiles**.

(Fases 1 demais, 2, 4, 5 e 6 já estavam concluídas antes.)
