# Importando dados exportados do Lovable

Use este fluxo quando voce tem arquivos exportados do Lovable/Supabase antigo,
mas nao tem a `service_role key` do projeto antigo.

## 1. Pasta dos dados

Crie uma pasta chamada `migration-data` na raiz do projeto e coloque nela os
arquivos exportados. O script aceita JSON ou CSV.

Exemplos:

```text
migration-data/species.csv
migration-data/moves.csv
migration-data/games.csv
migration-data/game_members.csv
migration-data/trainers.csv
migration-data/pokemon.csv
migration-data/tokens.csv
```

Tambem funciona com nomes `public.nome_da_tabela.csv`.

## 2. Mapa de usuarios

Crie:

```text
migration-data/user-map.csv
```

Formato:

```csv
old_user_id,new_user_id
id-antigo-do-lovable,id-novo-no-supabase
```

Todo campo de usuario antigo precisa aparecer nesse arquivo.

## 3. Chave do Supabase novo

Crie ou edite `.env.migration.local`:

```text
NEW_SUPABASE_URL=https://vgacodixwgwivxczqsnt.supabase.co
NEW_SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_do_supabase_novo
```

## 4. Teste sem gravar

```powershell
node scripts/import-exported-lovable-data.mjs --env=.env.migration.local --data=migration-data --users=migration-data/user-map.csv
```

## 5. Importacao real

```powershell
node scripts/import-exported-lovable-data.mjs --env=.env.migration.local --data=migration-data --users=migration-data/user-map.csv --execute
```

O script importa em ordem, troca os IDs antigos pelos novos e depois reconecta
campos de pagina que dependem de cenarios.
