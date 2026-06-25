# Status do roadmap de mapa (paridade Roll20)

## Concluído

### Fase 1 — Camadas (toggles) ✅
### Fase 3 — Páginas reais (multi-mapa) ✅

### Fase 7 — Iluminação dinâmica ✅
- Migração: `walls.blocks_sight/blocks_light`, `tokens.light_enabled/light_radius_bright/dim/color/angle/vision_enabled/vision_range`, `scenarios.darkness_level`.
- `MapBoard`: raycaster extraído (`castPolygon`), polígonos de visão e luz; revelam fog mask; luz adiciona tinta colorida com `mix-blend-mode: screen`. Opacidade do fog reage a `darkness_level` da página.
- `PageSwitcher`: slider de Escuridão (0–100%) por página.
- `TokenLightDialog` novo: editor de visão + luz emitida (claro/penumbra/cor) por token. Botão "Visão/Luz" no `TokenActionBar` (narrador).

### Reorganização de pastas ✅
- `FilesPanel`: botões ↑/↓ para reordenar pastas irmãs, ordem persistida em localStorage por mesa.

## Pendências do roadmap

- **Decks de cartas** completos (hoje só `REACTION_DECK` fechado).
- **Importar mapa por grid/tiles**.
- **Fase 7.1 (futura)**: editor visual de "portas" (paredes que abrem/fecham), checkboxes por-parede para `blocks_sight/blocks_light` (default já é true para ambas), cones direcionais (`light_angle`), auto-fog (memória do explorado).
