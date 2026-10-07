# D20 Project no celular

A versão web se adapta a telas menores que 768 px. Na mesa, use a barra inferior para alternar entre mapa, chat, arquivos, baralhos e música. As fichas abertas aparecem no cabeçalho; “Mesas” volta ao painel. Janelas auxiliares ocupam a tela do celular.

Para instalar, acesse o site publicado por HTTPS e use o botão de instalação no cabeçalho do painel. No Android, o Chrome pode oferecer a instalação diretamente. No iPhone, use Safari → Compartilhar → Adicionar à Tela de Início. A instalação reutiliza a conta e as mesmas mesas da versão web. Chat e sincronização precisam de internet.

Validação local: `npm ci --cache /tmp/d20-npm-cache`, `npm run typecheck`, `npm run build`. Confira também em um dispositivo físico: login, entrada em mesa, troca de painéis, abertura de ficha, teclado no chat, orientação e instalação. O fluxo autenticado deve ser validado com uma conta de teste, sem alterar mesas reais.
