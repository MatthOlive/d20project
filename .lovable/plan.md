# Já aplicado nesta resposta

1. **Music removida (preparada para voltar):**
  - Tab Music comentada em `_app.games.$gameId.tsx` (grid de 4 → 3 colunas).
  - `<MusicPlayer />` flutuante comentado, mas os imports de `MusicPanel`/`MusicPlayer` foram mantidos.
  - Arquivos `MusicPanel.tsx`, `MusicPlayer.tsx`, tabela `music_tracks` e suas policies permanecem intocados.
  - Para reativar: descomentar as 3 linhas marcadas com "Music" e mudar `grid-cols-3` → `grid-cols-4`.
2. **Compendium com subseções por seção:**
  - **Rules** agora agrupado por categoria (Básico, Combate, Mental & Vontade, Progressão, Especial, Social, Skills, Itens) com cabeçalho sticky.
  - **Pokédex**: detalhe de cada espécie dividido em subseções (Geral, Atributos base, Habilidades, Evoluções).
  - **Moves**: detalhe de cada move dividido em (Acurácia, Dano & Alvo, Efeito).
  - **Abilities**: agrupado alfabeticamente (A–Z) com cabeçalho sticky; corpo dentro da seção "Efeito".

---

# Plano — Paridade com Roll20

Analisei Roll20 (Tabletop Editor, Jumpgate, Roll20 Compendium, Charactermancer, Dynamic Lighting, Card Decks, Jukebox e Tabs/Pages). Comparei com o que já existe no D20 Project. Abaixo está o que falta, em ordem de impacto.

## Status atual vs Roll20

```text
Recurso Roll20                  Status no D20 Project
─────────────────────────────────────────────────────
Mapa com tokens + grid          Parcial (sem grid/snap)
Múltiplas páginas/cenas         Parcial (Scenarios = backgrounds)
Fichas (Charactermancer)        OK (Pokémon/Trainer/Handout)
Chat com rolagens               OK
Iniciativa                      OK
Compendium                      OK (recém-aprimorado)
Files/Handouts                  OK
Música/Jukebox                  Desativado por ora
Dynamic Lighting / Fog of War   FALTA
Desenho no mapa (drawing)       FALTA
Régua e medição                 FALTA
Camadas (GM/Object/Map/Light)   FALTA
Macros / rolagens salvas        FALTA
Decks de cartas                 Parcial (REACTION_DECK fechado)
Status/marker visual no token   Parcial (ícones, sem aura/tinting)
Visão por token (LoS)           FALTA
Importar mapa por grid/tiles    FALTA
```

## Fase 1 — Mapa: paridade tática (parcial)

1. **Grid configurável por cena** ✅: tamanho, cor, snap-to-grid (persistido em `scenarios`).
2. **Régua / medição** ✅: ferramenta Ruler com cells/m.
3. **Camadas (Layers)**: parcial — drawing/GM já existe; falta toggle Map/Tokens isolado.
4. **Drawing tools** ✅: caneta, retângulo, círculo, linha, texto, cor/espessura.
5. **Grid em tela cheia** ✅: grid cobre todo o viewport independente do tamanho do background.
6. **Múltiplos backgrounds** ✅: nova tabela `map_backgrounds`, camada "Backgrounds" no toolbar (narrador) para adicionar (URL ou arquivo), mover, redimensionar e rotacionar várias imagens; bring/send + delete por seleção.

## Fase 2 — Visibilidade: Fog of War e Dynamic Lighting ✅

1. **Fog of War manual** ✅: narrador pinta retângulos para revelar/ocultar áreas. Persistido em `fog_regions`.
2. **Dynamic Lighting (v2 simplificado)** ✅:
  - Paredes (`walls`) como segmentos de linha que bloqueiam visão (narrador desenha clicando 2x).
  - Tokens com `vision_radius` (raio em células) editável pelo narrador via botão "Visão" na action bar.
  - Render via SVG mask por jogador (raycasting client-side, 96 raios por token).
3. **Modo "GM Layer"** ✅: tokens/desenhos GM-only continuam invisíveis aos jogadores mesmo dentro do campo de visão.
4. Toggle de Fog/Lighting persistido em `games.fog_enabled` / `games.dynamic_lighting`, controlado pelo narrador na toolbar.

## Fase 3 — Páginas/cenas reais (multi-mapa)

Hoje `scenarios` é só background. Roll20 tem páginas independentes com tokens, fog e grid próprios.

1. Promover `scenarios` para "pages": cada uma com seus próprios tokens, grid, fog, drawings.
2. Narrador troca a "página ativa do jogador" sem afetar a "página visualizada pelo GM" (preview de mapa).
3. Migração: adicionar `page_id` em `tokens`, `map_drawings`, fog mask.

## Fase 4 — Macros e rolagens salvas ✅

1. Tabela `macros` ✅ (user_id, game_id nullable, name, command, color, visible_in_bar, sort_order). RLS por dono.
2. Barra flutuante de macros ✅ (`MacroBar`) na parte inferior do mapa, colapsável, com botões coloridos e diálogo de gerenciamento (criar/editar/excluir).
3. Suporta múltiplas linhas por macro; cada linha vira `/r XdY rótulo` (rolagem) ou mensagem de chat, reutilizando `parseRollCommand`/`rollDice`.
4. Macros podem ser locais do jogo ou globais (todos os jogos do usuário).

## Fase 5 — Tokens turbinados

1. **Auras** (círculo colorido translúcido configurável, 1 ou 2 auras por token — útil para alcance de move).
2. **Tinting** (overlay de cor para indicar "selecionado por GM", time A/B).
3. **Barras** extras (3 barras configuráveis: HP, Will, custom) já que hoje só HP é visível.
4. **Linha de visão** por jogador quando dynamic lighting estiver ativo.

## Fase 6 — Música (quando reativar)

Já temos `MusicPanel`/`MusicPlayer`. Quando voltar:

1. Playlists por cena (auto-tocar ao mudar de página).
2. Crossfade entre faixas.
3. Volume individual por faixa + master.
4. Sons curtos ("soundboard") com hotkeys.

## Detalhes técnicos

- **Persistência**: novas tabelas `map_drawings`, `fog_masks`, `walls`, `macros`, `card_decks`, `cards`, todas com RLS por `game_id` + GRANTs (autores: narrador escreve, membros leem).
- **Realtime**: usar canais Supabase como já fazemos em `tokens` e `initiative`.
- **Renderização do mapa**: o `MapBoard` atual usa DOM/CSS — para drawings/fog/dynamic lighting recomendo migrar a camada de mapa para **SVG sobreposto** (mais fácil que canvas e suficiente para o tamanho típico de mesa).
- **Performance**: raycasting de dynamic lighting roda só no cliente do jogador; servidor só serve dados.
- **Migrações faseadas**: cada fase = 1 migração + 1 conjunto de componentes; não precisa quebrar fichas existentes.

## Ordem sugerida de implementação

Fase 1 → Fase 2 → Fase 4 (macros são rápidas) → Fase 5 → Fase 3 (refator maior) → Fase 6.

Posso começar pela Fase 1 (grid + snap + régua) assim que aprovar — é o melhor custo-benefício imediato.