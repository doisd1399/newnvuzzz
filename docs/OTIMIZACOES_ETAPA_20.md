# Etapa 20 — preparação segura para desativar notificações legadas

## Objetivo

Preparar a retirada gradual da coleção `notificacoes` sem desligar compatibilidade agora e sem alterar o comportamento atual do aplicativo.

## Implementação

- criado `src/config/legacyNotifications.ts` como fonte única dos controles de compatibilidade;
- leitura histórica, listener recente, fallback de escrita e resolução de documentos antigos podem ser desligados separadamente;
- todos os controles permanecem ativados por padrão quando as variáveis não existem;
- o `NotificationsContext` não depende mais obrigatoriamente da inicialização da coleção legada quando seus controles forem desligados;
- `createNotification` continua gravando primeiro em `notifications` e somente utiliza `notificacoes` em caso explícito de `permission-denied` e com o fallback habilitado;
- `resolveNotifications` e a migração de identidade podem deixar de consultar o legado sem modificar outros fluxos;
- o gatilho `pushOnLegacyNotificationCreated` recebeu a chave `ENABLE_LEGACY_NOTIFICATION_PUSH`, também ativada por padrão;
- adicionado `npm run audit:legacy-notifications` para localizar referências diretas e validar os controles antes de qualquer retirada.

## Estado atual

Nenhuma capacidade legada foi desativada nesta etapa. Os padrões continuam equivalentes ao comportamento anterior:

- `VITE_LEGACY_NOTIFICATIONS_READ_HISTORY=true`;
- `VITE_LEGACY_NOTIFICATIONS_REALTIME=true`;
- `VITE_LEGACY_NOTIFICATIONS_WRITE_FALLBACK=true`;
- `VITE_LEGACY_NOTIFICATIONS_RESOLVE=true`;
- `ENABLE_LEGACY_NOTIFICATION_PUSH=true`.

## Ordem futura de desligamento

A retirada deverá ser feita somente após os testes integrados e observação em produção:

1. confirmar que todos os novos documentos são criados em `notifications`;
2. desligar o fallback de escrita legado;
3. desligar o listener recente legado;
4. desligar a leitura histórica e a resolução/migração antiga;
5. desativar e depois remover `pushOnLegacyNotificationCreated`;
6. somente por último remover regra, índice e código da coleção `notificacoes`.

Cada fase deve ser reversível pela restauração da variável correspondente.

## Arquivos modificados

- `src/config/legacyNotifications.ts`;
- `src/context/NotificationsContext.tsx`;
- `src/services/notificationService.ts`;
- `src/services/userIdentityService.ts`;
- `src/vite-env.d.ts`;
- `functions/src/index.ts`;
- `functions/lib/index.js` e mapa;
- `scripts/audit-legacy-notifications.mjs`;
- `scripts/audit-firebase-costs.mjs`;
- `package.json`;
- `.env.example`;
- `functions/.env.example`.

## Segurança contra regressões

- a coleção moderna continua prioritária;
- a deduplicação entre as duas coleções foi preservada;
- os limites de 200, 120 e 50 documentos foram mantidos;
- nenhum listener adicional foi criado;
- nenhuma regra ou índice foi removido;
- nenhum recurso legado foi desligado por padrão;
- não houve alteração visual, de rankings, viagens, empresas ou navegação.

## Validação executada

- auditoria geral: 0 críticos e 0 avisos;
- auditoria específica do legado: todos os controles aprovados e nenhuma referência direta inesperada;
- 126 arquivos TypeScript/TSX analisados sintaticamente;
- arquivos alterados transpilados individualmente sem erros;
- JavaScript compilado das Functions e scripts validados pelo Node;
- arquivos JSON validados.

O build completo não foi executado porque o registro de pacotes deste ambiente não disponibilizou `zwitch@2.0.4`. Nenhuma dependência nova foi adicionada.
