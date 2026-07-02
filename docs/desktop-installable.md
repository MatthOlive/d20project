# D20 Project instalavel

Esta etapa prepara o D20 Project para rodar como aplicativo instalado no Windows usando Tauri.

## O que ja funciona sem hospedagem

- O aplicativo instalado pode abrir localmente no seu computador.
- Ele usa o mesmo Supabase da versao web, entao os dados podem ser compartilhados entre jogadores.
- Para testar somente o app instalado, nao precisa contratar hospedagem.

## O que ainda precisa para testar no Windows

Instale estes itens uma vez no computador:

- Node.js LTS
- Rust
- Microsoft WebView2 Runtime
- Visual Studio Build Tools com suporte a C++

Depois disso, instale as dependencias do projeto e rode:

```bash
npm run desktop:dev
```

Para gerar o instalador:

```bash
npm run desktop:build
```

O instalador sera criado dentro de `src-tauri/target/release/bundle`.

## Observacao sobre login

O login por Google dentro do aplicativo instalado pode precisar de ajuste extra de redirecionamento no Supabase. Para os primeiros testes do instalavel, o caminho mais simples e manter o login web funcionando e depois ajustar o login desktop com calma.
