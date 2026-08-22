# Etapa 21 — estabilidade visual e desempenho mobile

Esta etapa reduz trabalho especulativo que competia com a tela ativa em
Android/WebView e no Preview mobile do Google AI Studio. Nenhuma consulta,
regra, índice, Function, cálculo de ranking ou estrutura do Firestore foi
alterada.

## Alterações

- Perfil de capacidade do runtime para identificar viewport mobile, iframe do
  Preview, economia de dados, conexão lenta, pouca memória ou poucos núcleos.
- Preloads críticos de usuário/empresa permanecem ativos e com prioridade alta.
- Preloads de logos, avatares e rotas secundárias passam a ser reduzidos,
  atrasados ou desativados em runtimes limitados.
- O aquecimento de ranking em segundo plano é desativado em runtimes
  limitados; a página continua usando seu carregamento normal sob demanda.
- O deep link `/ranking` não espera por um aquecimento que tenha sido
  desativado pelo perfil mobile.
- Preloads genéricos de imagens deixaram de usar prioridade alta por padrão.
- Rankings limitam a quantidade e a concorrência de imagens críticas no mobile.
- NVU News não executa prefetch de variantes e páginas seguintes em runtime
  mobile limitado.
- Reconexões completas de sessão deixaram de ocorrer após mudanças rápidas de
  visibilidade; a sessão só é revalidada após uma interrupção significativa.
- Backdrop blur de tela inteira é removido no mobile, mantendo a camada escura
  estável e evitando repintura contínua da página inteira.

## Compatibilidade

- Não exige deploy de Firebase Functions, regras ou índices.
- Não altera resultados, permissões, notificações ou filtros.
- Em runtimes limitados, apenas o trabalho antecipado é reduzido. Ao abrir uma
  página, seus dados continuam sendo carregados normalmente.
