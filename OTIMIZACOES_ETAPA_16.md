# Etapa 16 — extração segura do contexto de notificações

## Objetivo

Retirar do `AppContext.tsx` a responsabilidade direta de abrir listeners, hidratar, deduplicar e atualizar notificações, preservando o comportamento atual da Central de Notificações e a compatibilidade com a coleção legada `notificacoes`.

## Implementação

Foi criado `src/context/NotificationsContext.tsx`, responsável por:

- manter o estado de notificações e o indicador de hidratação;
- escutar a coleção moderna `notifications` com limite de 200 documentos não lidos;
- carregar uma única vez até 120 notificações legadas não lidas;
- manter em tempo real somente até 50 registros legados criados durante a sessão;
- deduplicar eventos equivalentes e priorizar a coleção moderna;
- filtrar por usuário, perfil ativo e empresa ativa;
- marcar notificações como lidas;
- persistir o controle de popup já exibido;
- encerrar os listeners na troca de usuário, empresa, perfil ou logout;
- ignorar respostas assíncronas pertencentes a uma sessão anterior.

## Compatibilidade

O hook `useNotificationStore` continua sendo exportado por `AppContext.tsx` como adaptador, evitando quebra de integrações antigas.

Os consumidores principais passaram a importar diretamente o contexto dedicado:

- `src/components/NotificationToastListener.tsx`
- `src/layouts/AdminLayout.tsx`
- `src/layouts/DriverLayout.tsx`

O contexto legado `useAppStore` continua recebendo os campos de notificações por uma camada de compatibilidade. Assim, nenhuma API pública existente foi removida nesta etapa.

## Benefícios

- O grande efeito de dados privados do `AppContext` não abre mais listeners de notificações.
- Atualizações de notificações deixam de recriar o `AppProvider` principal.
- Ações de notificação mantêm referências estáveis durante a sessão.
- A troca de perfil ou empresa limpa o estado anterior antes de publicar o novo escopo.
- Nenhuma leitura global ou listener ilimitado foi introduzido.

## Arquivos modificados

- `src/context/NotificationsContext.tsx` — novo contexto dedicado.
- `src/context/AppContext.tsx` — remoção da lógica interna e adaptador de compatibilidade.
- `src/components/NotificationToastListener.tsx` — consumo direto do novo contexto.
- `src/layouts/AdminLayout.tsx` — consumo direto do novo contexto.
- `src/layouts/DriverLayout.tsx` — consumo direto do novo contexto.
- `scripts/audit-firebase-costs.mjs` — auditoria atualizada para a nova estrutura.

## Itens não alterados

- envio de notificações push;
- Cloud Functions de push;
- coleção legada `notificacoes`;
- regras e índices do Firestore;
- rankings e filtros de simulador;
- histórico de viagens;
- NVU News;
- layout da Central de Notificações.

## Validação realizada

- análise sintática dos arquivos TypeScript e TSX;
- auditoria estática de custos e regressões;
- confirmação de ausência de listeners de notificações no `AppContext`;
- confirmação de limites nas consultas moderna e legada;
- confirmação de limpeza dos três listeners utilizados pelo contexto dedicado.

O build completo não foi executado porque a instalação offline das dependências não encontrou `zwitch@2.0.4` no cache do ambiente. Esta etapa não exige deploy de Functions, regras ou índices.
