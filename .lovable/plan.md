# Plano de melhorias

Sete mudanças independentes. Posso fazer todas, mas são grandes — confirme antes de executar, ou diga quais priorizar.

## 1. Janela da ficha — botão "abrir em nova aba"

- Adicionar botão na barra do `FloatingWindow` (ao lado de minimizar/fechar) com ícone de "external link".
- Ao clicar: abre `/sheet/:kind/:id` em nova aba (criar rota nova `src/routes/sheet.$kind.$id.tsx` que renderiza `TrainerSheet`/`PokemonSheet` em tela cheia).

## 2. Minimizar com duplo clique

- No `FloatingWindow`: duplo clique na barra colapsa para mostrar só o título (altura mínima) e aplica `opacity-50`.
- Outro duplo clique restaura.

## 3. SpDef usa Insight como config da mesa

- Remover toggle individual em `TrainerSheet`/`PokemonSheet` (campo `modifiers._spdef_uses_insight`).
- Adicionar coluna `settings jsonb` em `games` (ou usar coluna existente) com `spdef_uses_insight: boolean`.
- Adicionar toggle no `SettingsDialog` da mesa — só narrador edita.
- `TokenStatsBar` lê do game settings.

## 4. Drag-and-drop para reordenar Pokémon no time

- Em `TrainerSheet` (lista de party): arrastar pokémon A sobre pokémon B troca posições (atualiza `party_order` ou similar no banco).

## 5. Mapa — tokens redimensionáveis + movimento suave + tamanho fixo + chat overlay

- Token: handle de resize no canto quando selecionado, persiste `size` em `tokens`.
- Movimento: adicionar `transition: left/top 200ms ease` no token (durante drag desativa).
- Layout: mapa ocupa janela inteira, chat panel flutua por cima (posição fixa direita).
- Botão para o mestre redimensionar imagem de fundo (escala/zoom do background separada do zoom do board).

## 6. TokenActionBar → Moves abre janela igual à ficha

- Atualmente o botão "Moves" só rola accuracy. Trocar para abrir o `MoveCard`/lista de moves real (mesmo componente da ficha) que rola accuracy + damage pool igual.

## 7. Settings da ficha — duplicar ficha

- Adicionar item "Duplicar" no menu de settings de `TrainerSheet`/`PokemonSheet`.
- Cria nova linha com mesmos dados (novo id, nome + " (cópia)"). nova ficha n vinculada ao treinador q o pokemon pertencia caso ele pertencesse a um treinador.

## 8. Files — pastas arrastáveis e aninhadas

- Pastas viram drag-source e drop-target.
- Soltar pasta A em pasta B → A vira subpasta de B (campo `parent_id` em `folders`).
- Renderização recursiva da árvore.

## Recomendação

Sugiro fazer em 2-3 turnos agrupados:

- **Turno A** (UI rápida): 1, 2, 7
- **Turno B** (mapa): 5, 6, e arrastar tokens
- **Turno C** (dados/banco): 3, 4, 8

Confirma se faço tudo de uma vez ou prefere começar por algum grupo?