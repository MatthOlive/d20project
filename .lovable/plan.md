## Fase 1 (resto) + Fase 3 — Páginas reais multi-mapa

### Parte A — Toggle de Camadas (rápido, primeiro)

`MapBoard.tsx` (narrador): adicionar 2 toggles na toolbar — "Background" e "Tokens" — que escondem visualmente cada camada do próprio narrador (somente cliente, não persiste, não afeta jogadores). Já existe a noção de camada GM/drawing; isso só completa a paridade visual com Roll20.

### Parte B — Fase 3: Cenas viram páginas reais

**Modelo de dados** — uma migração só:

1. Adicionar `page_id uuid REFERENCES scenarios(id) ON DELETE CASCADE` em:
   - `tokens`, `map_drawings`, `fog_regions`, `walls`, `map_backgrounds`
2. Em `games`, adicionar:
   - `active_page_id uuid` — página que os jogadores veem (default = primeira cena criada do jogo)
   - (`current_scenario_id` já existe e é usado por música; vamos manter os dois separados para não acoplar música com mapa tático)
3. Backfill: para cada `game`, pegar a primeira `scenarios` (ou criar "Página 1" se não houver) e atribuir esse `page_id` a todos os tokens/drawings/fog/walls/backgrounds existentes. Setar `games.active_page_id`.
4. Tornar `page_id` NOT NULL após backfill.
5. Atualizar RLS dessas tabelas para continuar filtrando por `game_id` (sem mudança lógica) — `page_id` só restringe rendering, não permissão.

**Cliente — `MapBoard.tsx`:**
- Estado novo: `viewingPageId` (narrador pode estar visualizando uma página diferente da `active_page_id`; jogadores sempre veem `active_page_id`).
- Todas as queries (`tokens`, `map_drawings`, `fog_regions`, `walls`, `map_backgrounds`) passam a filtrar por `page_id = viewingPageId`.
- Realtime subs filtram pelo `page_id` atual; trocar de página reassina.
- Inserts (token novo, desenho, parede, fog, background) recebem `page_id: viewingPageId`.
- Mover token entre páginas: action no `TokenActionBar` "Mover para página…" (só narrador).

**Cliente — novo `PageSwitcher.tsx`** (canto sup. esq. do mapa, só narrador):
- Dropdown listando todas as `scenarios` do jogo.
- Para cada uma, dois botões: "Visualizar" (muda `viewingPageId` local) e "Tornar ativa para jogadores" (UPDATE em `games.active_page_id`).
- Indicador visual: qual está sendo visualizada pelo GM, qual está ativa para jogadores.
- Botão "+ Nova página" cria `scenarios` e já joga o GM nela.
- Jogadores: sem switcher. `MapBoard` escuta `games.active_page_id` via realtime e troca o `viewingPageId` automaticamente.

**Compatibilidade:**
- `MusicPanel` continua usando `scenarios.id` como playlist key — sem mudança.
- `ScenariosManager` (gerenciador de cenas existente) continua funcionando; só vira "Gerenciador de páginas".

### Por que essa ordem
Toggle de camadas é 15 min e fecha Fase 1. Fase 3 é a migração grande; depois dela o resto do roadmap (decks, importar tiles) fica isolado e simples.

### Pendências restantes do roadmap após isso

- Decks de cartas completos (hoje só REACTION_DECK existe, fechado).
- Importar mapa por grid/tiles.

### Arquivos tocados

```text
supabase/migrations/<timestamp>_pages_multi_map.sql   (novo)
src/components/MapBoard.tsx                            (filtros por page_id, viewingPageId)
src/components/PageSwitcher.tsx                        (novo)
src/components/TokenActionBar.tsx                      ("Mover para página")
.lovable/plan.md                                       (marcar Fase 1 e Fase 3 como ✅)
```
