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

## Fase 1 — Mapa: paridade tática (alto impacto)

1. **Grid configurável por cena**: tamanho da célula (px), cor, on/off, snap-to-grid ao mover token. Persistir em `scenarios.grid_size` e `grid_snap`.
2. **Régua / medição**: ferramenta "Ruler" para arrastar e ver distância em células/m. Suporte a polyline (segmentos) e auto-limpeza ao soltar.
3. **Camadas (Layers)**: Map / Tokens / GM-only / Drawing. Toggle visível só para narrador. Tokens da camada GM-only ficam ocultos para jogadores.
4. **Drawing tools**: caneta livre, retângulo, círculo, linha, texto livre, com paleta de cores. Persistir em nova tabela `map_drawings` (game_id, scenario_id, layer, geometry jsonb, stroke, fill).

## Fase 2 — Visibilidade: Fog of War e Dynamic Lighting

1. **Fog of War manual**: narrador pinta áreas ocultas/reveladas com pincel/retângulo. Persistir como máscara (poligonal ou bitmap base64).
2. **Dynamic Lighting (v2 simplificado)**:
  - Paredes ("walls") como segmentos que bloqueiam visão.
  - Tokens com `light_radius` e `vision_radius` — jogadores só veem o que seus tokens vêem.
  - Render via SVG mask por jogador (raycasting simples client-side).
3. **Modo "GM Layer"** combina com isto: tokens/desenhos GM-only invisíveis aos jogadores mesmo dentro do campo de visão.

## Fase 3 — Páginas/cenas reais (multi-mapa)

Hoje `scenarios` é só background. Roll20 tem páginas independentes com tokens, fog e grid próprios.

1. Promover `scenarios` para "pages": cada uma com seus próprios tokens, grid, fog, drawings.
2. Narrador troca a "página ativa do jogador" sem afetar a "página visualizada pelo GM" (preview de mapa).
3. Migração: adicionar `page_id` em `tokens`, `map_drawings`, fog mask.

## Fase 4 — Macros e rolagens salvas

1. Tabela `macros` (user_id, game_id?, name, command, color, visible_in_bar bool).
2. Barra inferior de macros (toggle), com sintaxe `/r 2d6+3 Ataque` reaproveitando o parser do `ChatPanel`.
3. Macros por ficha: já existem botões de move; adicionar slot livre por ficha ("ações customizadas").

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