# Fase 7 — Iluminação dinâmica (Dynamic Lighting)

Sistema estilo Roll20 DL / FoundryVTT: paredes bloqueiam luz e visão; tokens emitem luz; jogadores enxergam só o que está iluminado e na linha de visão do seu token. Tudo 2D, com raycasting via canvas — sem ray tracing real (3D).

## O que vai existir

1. **Paredes já existem** (`walls`) e bloqueiam token, mas hoje não bloqueiam visão/luz. Vamos reusar a mesma tabela e adicionar duas flags: `blocks_sight boolean` e `blocks_light boolean` (default true para ambas).
2. **Luzes em tokens**: novas colunas em `tokens` — `light_radius_bright`, `light_radius_dim`, `light_color text`, `light_angle int` (cone, 360 = omni), `light_enabled bool`. Toda configurável no `TokenActionBar` (narrador, ou dono do token).
3. **Luz ambiente da página**: `scenarios` ganha `darkness_level real` (0 = pleno dia, 1 = breu total). Em 0 a iluminação fica desligada.
4. **Visão dos jogadores**: cada jogador vê pelo "ponto de vista" dos tokens que ele controla (owner_id = uid). Narrador vê tudo. Configurável: `tokens.vision_enabled bool`, `vision_range`.

## Renderização (cliente, em `MapBoard`)

Camada nova `<LightingCanvas>` por cima de tokens, abaixo da camada GM:

```text
+-----------------------------------+
| backgrounds                       |
| drawings                          |
| tokens                            |
| LIGHTING (multiply mask) ← novo   |
| fog of war (manual)               |
| GM layer                          |
+-----------------------------------+
```

Algoritmo por frame (rAF, recomputa só quando algo muda):

1. Coleta `walls` da página atual + `tokens` com luz + tokens de visão do jogador.
2. Para cada fonte (luz ou olho), faz raycasting 2D: dispara raios em direção a cada vértice de parede (e ±0.0001 rad p/ pegar bordas) → resulta em polígono de visibilidade.
3. Desenha o polígono num canvas off-screen com `radialGradient` (bright sólido, dim com alpha menor).
4. Compõe todos os polígonos com `globalCompositeOperation = "lighter"` num buffer.
5. Aplica no canvas principal com `"multiply"` sobre overlay escuro `rgba(0,0,0, darkness_level)`.

Otimizações:
- Recálculo só dispara em mudança de `walls`, `tokens` da página, ou `darkness_level` (já temos realtime).
- Memo de polígonos por fonte; só recomputa fonte cuja `(x,y,raio)` mudou.
- Cap de 50 fontes por página, raios em fração da viewport (0..1) já existente.

## Migration

```sql
ALTER TABLE public.walls
  ADD COLUMN blocks_sight boolean NOT NULL DEFAULT true,
  ADD COLUMN blocks_light boolean NOT NULL DEFAULT true;

ALTER TABLE public.tokens
  ADD COLUMN light_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN light_radius_bright real NOT NULL DEFAULT 0,
  ADD COLUMN light_radius_dim real NOT NULL DEFAULT 0,
  ADD COLUMN light_color text NOT NULL DEFAULT '#ffd27a',
  ADD COLUMN light_angle int NOT NULL DEFAULT 360,
  ADD COLUMN vision_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN vision_range real NOT NULL DEFAULT 0;

ALTER TABLE public.scenarios
  ADD COLUMN darkness_level real NOT NULL DEFAULT 0;
```

Sem novos GRANT/policies — colunas em tabelas existentes.

## UI

- **`TokenActionBar`**: nova aba "Luz/Visão" com sliders de raio bright/dim, color picker, ângulo (com preview de cone), toggle visão.
- **`PageSwitcher`** / configurações da cena: slider "Escuridão" 0–100%.
- **Editor de paredes** (já existe): adicionar checkboxes "Bloqueia visão" / "Bloqueia luz" no painel da parede selecionada.

## Arquivos

- Migration nova.
- `src/components/MapBoard.tsx`: nova camada `LightingCanvas` interna + hooks de recompute.
- `src/lib/lighting.ts` (novo): raycaster puro (entradas: walls, fontes, viewport → polígonos).
- `src/components/TokenActionBar.tsx`: aba Luz/Visão.
- `src/components/PageSwitcher.tsx`: slider de escuridão.
- `src/integrations/supabase/types.ts`: regenerado automaticamente.

## Fora de escopo (deixar p/ Fase 7.1 se pedir depois)

- Editor visual de "portas" (paredes que abrem/fecham).
- Luz colorida combinada via HDR.
- Sombras suaves (penumbra) — o raycasting hoje vai dar bordas duras.
- Auto-fog (descobrir áreas exploradas e manter levemente visíveis).

Confirma esse escopo p/ eu implementar?