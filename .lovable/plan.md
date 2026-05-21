## Visão geral

Onze mudanças agrupadas por área. Implemento tudo de uma vez, mas confirma o escopo antes — algumas têm trade-offs.

---

### 1. Combate — STAB + defesa do alvo

- No `SheetRolls` / botão de Move da `PokemonSheet`:
  - **STAB**: se o tipo do move ∈ tipos do Pokémon → `+1 dado` na damage pool (rótulo "STAB").
  - **Defesa do alvo**: ao clicar em rolar um move, abrir um mini-popover com input numérico "Defense / Sp.Def do alvo" (default 0). Esse valor é **subtraído da damage pool** antes de rolar. Mostra no chat como `Damage {Stat}+{Skill}+STAB − Def(N) · {Pool}d6`.
  - Move físico usa Def, especial usa Sp.Def — o popover já sugere o label certo baseado em `move.category`.

### 2. Ordem de rolagem de Move (Accuracy → Damage)

- Hoje só rola Accuracy. Vou mudar pra fluxo de 2 passos atômicos:
  1. Rola **Accuracy** (`accuracy_stat + accuracy_skill`) e posta no chat.
  2. Se sucessos > 0, **automaticamente** rola **Damage** (`damage_stat + STAB − defesa`) e posta logo abaixo com label `"… Damage"`.
- No `narrator.functions.ts`: o system prompt instrui a IA a ler **pares Accuracy+Damage** consecutivos do mesmo autor/move antes de narrar o resultado, e a só considerar dano quando Accuracy passou.

### 3. Botão "Turn Order" pro mestre

- No header do jogo, ao lado dos botões de cenário, adiciono botão `Turn Order` (só narrador) que abre/fecha o `InitiativePanel` flutuante. Hoje ele aparece sozinho quando há iniciativa — vou manter aparecendo, mas o botão permite reabrir após fechar.

### 4. Seleção de idioma + tradução da UI

- Ao criar jogo: select com `pt-BR`, `en`, `es` (posso adicionar mais — diz aí).
- Persisto em `games.language`.
- Adiciono i18n leve com `react-i18next` (sem libs pesadas), com dicionários `pt-BR / en / es` cobrindo labels da UI principal (header, fichas, chat, compendium, dashboard).
- **Não traduzo**: nomes de moves, abilities, naturezas, espécies — ficam no idioma original do dado.
- A IA narradora recebe o idioma no system prompt: "Responda sempre em {language}, mas mantenha em inglês os nomes próprios de Pokémon, moves e abilities".

> ⚠️ Heads-up: traduzir 100% da UI é trabalhoso. Vou cobrir o essencial (labels visíveis, botões, headings). Strings perdidas continuam em inglês até serem reportadas.

### 5. Modo seleção nas fichas + pastas colapsáveis

- Lista de fichas (sidebar Files):
  - Botão `Select` ativa modo seleção → cada ficha ganha checkbox.
  - Ações em lote: `Delete selecionadas`, `Mover para pasta…`.
  - Drag continua funcionando para o mapa; em modo seleção, o drag move múltiplas fichas pra pasta de destino.
  - Pastas viram **colapsáveis** (click no header expande/recolhe, estado salvo em localStorage por jogo).

### 6. Confidence conforme o livro

- Verifique a confidence no livre e use os valores q estao al apenas sem formulas.

### 7. Dark mode como tema padrão

- `<html class="dark">` por default no `__root.tsx`.
- Toggle no menu do usuário (após login) com persistência em localStorage + `profiles.theme`.
- `styles.css` já tem `.dark` definido — só preciso preencher tokens que estão usando cores hardcoded em alguns componentes.

### 8. Tela de jogos — deletar e deleção em massa

- Dashboard: cada card de jogo ganha botão `Delete` (ícone lixeira, com confirmação).
- Botão `Select` no topo ativa modo de seleção em massa → checkbox por card → `Delete selecionados`.
- Só o narrador (owner) consegue deletar — RLS já cobre isso.

### 9–11. IA: usar ficha já criada + atributos corretos + variação

Três correções no `narrator.functions.ts`:

**(a) Não duplicar fichas (#9):** antes de chamar `spawn_wild_pokemon`/`spawn_trainer`, a tool busca em `pokemon`/`trainers` do jogo se já existe ficha com mesmo nome/species + flag `ai_spawned=true` numa cena ativa. Se existir, retorna a ficha existente em vez de criar nova. Adiciono coluna `ai_spawned boolean` e `ai_scene_id text` opcional pra rastrear "este encontro". Quando combate acaba (initiative limpa), libera novos spawns.

**(b) Atributos corretos por rank (#10):**

- Audito a tabela `RANK_TABLE` no `narrator.functions.ts` vs livro:
  - Pokémon e treinador: starter +0 attr/+0 social, beginner +2 attr/+2 social, amateur +4 attr/+4 social, ace +6 attr/+6 social, pro +8 attr/+8 social. (valores sao referentes ao starter entao se um personagem é pro ele tem +8 pontos de atributo q um starter e +4 q um amateur por exemplo) (caps 1/2/3/4/5/5 em skills).
  - **Treinador**: o livro usa `rank + faixa etária`. Vou implementar: idade dá pontos extras (criança +0 atributo fisico / +0 social, jovem +2 attr/+2 social, adulto +4 attr/+4 social, veterano +3attr/+6 social) somados ao rank base.
- Adiciono validação **server-side**: `clampPoints()` rejeita distribuições que excedem o total, e a tool retorna erro pra IA refazer.

**(c) Aleatoriedade vs priorização (#11):**

- Tool ganha parâmetro `importance: "random" | "themed"`.
- `random` → distribuição uniforme (já existente, melhoro a RNG pra não viciar em strength).
- `themed` → IA passa `priorities: { attrs: [...], skills: [...] }` e o servidor distribui ~60% nesses, ~40% no resto.
- System prompt instrui: "Encontros aleatórios (selvagens) usam `random`. NPCs nomeados (líderes de ginásio, rivais, recorrentes) usam `themed` com prioridades coerentes (ex: líder de ginásio de fogo → Special alto, Channel alto)".

---

### Migração de DB necessária

```sql
alter table games add column language text not null default 'pt-BR';
alter table profiles add column theme text not null default 'dark';
alter table pokemon add column ai_spawned boolean not null default false;
alter table pokemon add column ai_scene_id text;
alter table trainers add column ai_spawned boolean not null default false;
alter table trainers add column ai_scene_id text;
```

---

### Detalhes técnicos

- **Arquivos editados**: `SheetRolls.tsx`, `PokemonSheet.tsx`, `TrainerSheet.tsx`, `ChatPanel.tsx`, `narrator.functions.ts`, `pokerole.ts`, `_app.games.$gameId.tsx`, `_app.dashboard.tsx`, `__root.tsx`, `styles.css`.
- **Arquivos novos**: `src/lib/i18n.ts` (config react-i18next), `src/lib/locales/{pt-BR,en,es}.json`, `src/components/ThemeToggle.tsx`, `src/components/FileBrowser.tsx` (extraído do route file pra caber seleção em lote).
- **Dependências novas**: `react-i18next`, `i18next` (~30kb gzip, sem polyfills nativos).

---

### O que NÃO está incluso

- Tradução de descrições de moves/abilities/effects (são texto livre dos PDFs, fora de escopo).
- Tradução dinâmica de respostas da IA via tradutor externo — quem traduz é o próprio modelo via instrução de sistema.
- Sincronização de tema entre dispositivos em tempo real (só carrega no login).

Posso seguir com tudo isso? Se quiser cortar/reordenar (ex: deixar i18n pra depois) é só dizer.