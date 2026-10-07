# Publicar a versão web

## Vercel

1. Crie uma conta em https://vercel.com usando o GitHub e importe `MatthOlive/d20project`.
2. Use Node.js 24. O `vercel.json` configura o build; deixe o diretório de saída no padrão. O Nitro gera `.vercel/output` com arquivos estáticos e a função do servidor.
3. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` com os dados do projeto Supabase existente. Use a chave pública/publishable; nunca uma chave service-role no frontend.
4. Publique. A hospedagem fornece uma URL HTTPS; não é necessário comprar domínio.
5. No Supabase, em Authentication → URL Configuration, adicione a URL final às URLs de redirecionamento permitidas. Preserve as URLs usadas pelo aplicativo desktop.
6. Confira login por email, Google, entrada em mesa, instalação mobile e o download do instalador Windows.

## Visibilidade

O site envia `X-Robots-Tag: noindex, nofollow, noarchive`, inclui meta robots e bloqueia rastreamento no robots.txt. Não publica sitemap. Isso desencoraja indexação, mas não é controle de acesso: qualquer pessoa com o link pode abrir a página e repassar o endereço. As mesas continuam protegidas pelo login e pelas permissões existentes. Para restringir também a página inicial, habilite proteção de acesso na hospedagem e valide a instalação PWA sob essa proteção.

## Downloads

A página inicial, o login e o painel de mesas mostram as duas opções. Mobile instala a versão web. PC resolve o instalador Windows x64 pelo `latest.json` da última GitHub Release. Se o manifesto não estiver disponível, abre a página da última release. As releases precisam ser acessíveis aos convidados; repositórios privados exigem acesso GitHub ou distribuição dos arquivos por outro serviço.
