# Redesign de fichas estilo "Pokémon League Trainer Card"

Mudança grande que toca `TrainerSheet.tsx`, `PokemonSheet.tsx` e o painel de fichas em `_app.games.$gameId.tsx`. Antes de mexer, alinhamento de escopo e decisões abertas.

## 1. Novo layout da Ficha de Treinador (6 blocos)

**Bloco 1 — Identidade**
- Esquerda: imagem grande (avatar do treinador) + caixa "Money" abaixo.
- Direita: linha 1 = Nome ocupando largura toda. Abaixo grid com Sexo, Idade, Nature, HP/HPmax, Will/Willmax, Confidence.
- Linha de botões: Initiative, Attack, Evasion, Clash, Generic Roll, **Catch** (nova rolagem — fórmula a confirmar, ver §7).

**Bloco 2 — Três caixas lado a lado**
- (a) Status Problems (Burn, Poison, Paralyzed, etc. — já existe em `SheetRolls.tsx`).
- (b) Atributos físicos: Strength, Dexterity, Vitality, Insight (dots).
- (c) Atributos sociais: Tough, Cool, Beauty, Clever, Cute (dots).

**Bloco 3 — Skills em 5 colunas**
- Fight: Brawl, Throw, Evasion, Weapons.
- Survival: Alert, Athletic, Nature, Stealth.
- Social: Allure, Etiquette, Intimidate, Perform.
- Knowledge: Crafts, Lore, Medicine, Science.
- Custom: botão **+ Add Skill** → cria linha editável (nome livre + dots). Persistido em coluna nova `trainers.custom_skills jsonb`.

**Bloco 4 — Inventário**
- Box Potions: Potion / Super Potion / Hyper Potion com quantidade + indicador de cargas.
- Outras 2 boxes: Itens-chave / Itens diversos (lista simples com add/remove).

**Bloco 5 — Badges & Achievements**
- Badges: grid de 8 slots com **+ Add Badge** (nome + sprite opcional).
- Achievements: mantém o sistema atual com add → linha editável + checkbox.

**Bloco 6 — Pokédex** (mantém o componente atual).

**Bloco 7 — Moves do treinador** (interpretei o "sexto bloco sera para os moves" como sétimo — confirme se faz sentido para treinador; treinadores em Pokérole normalmente não têm moves. Posso **omitir** este bloco da ficha de treinador e deixar moves só na ficha do Pokémon, que é o padrão do livro).

## 2. Abas-fichário laterais (8 abas)

Coluna vertical à esquerda da ficha, estilo separadores de fichário:

```text
┌──┐
│T │  Aba 1 — Treinador (abre a ficha do treinador)
├──┤
│P1│  Abas 2-7 — slots de equipe (sprite do Pokémon no slot)
│P2│         Slot vazio mostra "+" → botão "Copiar de Files"
│..│         que abre dropdown com Pokémon já criados em Files
│P6│
├──┤
│PC│  Aba 8 — Caixa. Grid de sprites de todos Pokémon
└──┘       capturados que não estão na equipe. Click abre ficha.
```

Detalhes:
- Equipe = novos campos no schema: `pokemon.owner_trainer_id uuid` + `pokemon.team_slot smallint` (1-6, null = no PC).
- "Copiar ficha" duplica a row do Pokémon em Files e atribui ao trainer/slot (cópia, não referência — para o jogador poder editar sem afetar a original-template).
- Registro na Pokédex (já existe) dispara ícone na aba PC do dono.
- Sprite resolvido a partir de `species` via PokeAPI ou tabela local (a confirmar — ver §7).

## 3. Banco de dados (migration)

```sql
alter table public.trainers
  add column if not exists custom_skills jsonb not null default '[]'::jsonb,
  add column if not exists badges jsonb not null default '[]'::jsonb,
  add column if not exists inventory jsonb not null default '{}'::jsonb;

alter table public.pokemon
  add column if not exists owner_trainer_id uuid references public.trainers(id) on delete set null,
  add column if not exists team_slot smallint check (team_slot between 1 and 6);

create unique index if not exists pokemon_team_slot_unique
  on public.pokemon(owner_trainer_id, team_slot)
  where team_slot is not null;
```

Money, sexo, idade, will já existem em `trainers`? Vou checar antes da migration; adiciono o que faltar.

## 4. Componentes a criar/editar

- **Criar** `src/components/SheetTabs.tsx` — barra lateral de 8 abas + lógica de seleção/cópia.
- **Reescrever** `src/components/TrainerSheet.tsx` com os 6 blocos.
- **Editar** `src/components/PokemonSheet.tsx` — só para envolver no `SheetTabs` (mantém conteúdo atual).
- **Editar** `_app.games.$gameId.tsx` — quando abrir ficha de treinador, mostra `SheetTabs` por volta.

## 5. Visual

Vou manter o estilo dark do app (não copiar o vermelho/branco do PDF literalmente, já que o tema é dark). Uso da imagem como **referência de layout** (organização dos blocos, dots, separadores tipo "fichário"). Quer que eu reproduza as cores vermelhas exatas estilo cartão da Pokémon League? Por padrão vou de dark theme com accents vermelhos discretos.

## 6. O que **NÃO** está incluso

- Trocar dots por inputs numéricos (mantém `DotEditor` existente).
- Drag-and-drop entre slots da equipe e PC (botão "mover para equipe / PC" via menu).
- Sincronia em tempo real do PC com outros jogadores assistindo (mantém o pattern atual de realtime).
- Sistema completo de "ride pokémon", "happiness", etc. fora do escopo do livro básico.

## 7. Perguntas (responda antes de eu codar)

1. **Botão Catch** — qual fórmula? Pokérole usa rolagem com modificadores baseados em HP atual do alvo + status. Posso (a) implementar o cálculo oficial do livro (puxando HP do alvo selecionado no Turn Order), ou (b) abrir um diálogo onde o mestre digita o "dificuldade" e o jogador rola Dex + Throw. Qual prefere?
2. **Bloco 7 (moves do treinador)** — omitir (treinadores não têm moves no Pokérole), ou criar mesmo assim como lista livre de "técnicas"?
3. **Sprites dos Pokémon nas abas/PC** — usar PokeAPI (`https://raw.githubusercontent.com/PokeAPI/sprites/...`) ou já existe uma fonte local no projeto?
4. **Visual** — manter dark theme com toques vermelhos, ou reproduzir o cartão claro vermelho/branco da referência?
