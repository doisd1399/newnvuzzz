# Correção de paridade do Ranking — Desktop e Android

## Causa raiz

O ranking recebia duas fontes da coleção `historico_viagens`:

1. documentos canônicos consultados em tempo real por `completedAt`;
2. documentos antigos encontrados pelas datas legadas.

O listener publicava a primeira fonte antes da segunda terminar. Como navegador
desktop e WebView Android possuem cache e tempo de resposta diferentes, eles
podiam exibir subconjuntos diferentes do mesmo período.

## Correções aplicadas

- Ranking, perfil da empresa e perfil do motorista agora aguardam o snapshot
  canônico autoritativo do servidor e a leitura legada terminarem.
- As duas fontes são mescladas por ID antes de qualquer resultado ser publicado.
- O documento canônico prevalece quando o mesmo ID aparece nas duas fontes.
- O build passa a gerar `dist/nvu-build.json` com um identificador exclusivo.
- O mecanismo já existente no app usa esse manifesto para recarregar o WebView
  Android quando o bundle publicado no Netlify muda.
- O pacote final possui somente uma raiz do projeto.

## Validações

- `npm run lint`: aprovado.
- `npm run build`: aprovado.
- `npm --prefix functions run build`: aprovado.
- Teste de prontidão e precedência das fontes: aprovado.
- Manifesto `dist/nvu-build.json`: gerado e validado.

## Publicação

Publique a aplicação web completa no mesmo site Netlify configurado como origem
remota do APK. Não misture a pasta `dist` de outra versão com este código.

## Correção adicional — confirmação atômica das datas legadas

- As quatro consultas de compatibilidade por data (`dataFechamento`, `date`,
  `dataLancamento` e `createdAt`) agora precisam ser confirmadas pelo servidor
  no mesmo ciclo antes de formar o conjunto do ranking.
- Uma falha transitória em qualquer consulta não pode mais armazenar um lote
  parcial no cache de memória como se fosse o período completo.
- Em caso de falha, o repositório mantém a fonte como não pronta e delega a
  nova tentativa ao backoff já existente de `useTripsRealtime`; não há leitura
  global adicional nem ampliação do escopo no Firestore.
