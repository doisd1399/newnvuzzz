# NVU GTO R3.1 — Google AI Studio / Web / Firebase

Status: fonte sincronizada com o projeto Capacitor Android v1.0.21.
Data: 2026-08-11.

## Alteração final

Ao encerrar uma operação, a interface passa a orientar diretamente:

> Operação concluída. Inicie uma nova operação para continuar.

No modal final:

> Inicie uma nova operação para continuar.

## Fluxo GTO validado

- operação ativa/delayed é aceita pelo launcher GTO;
- operação completed/awaiting_completion/cancelled é bloqueada para nova viagem;
- contexto enviado ao Android inclui status, progresso e total de entregas;
- observador pode ser recuperado e precisa reportar saúde antes de abrir o GTO;
- aliases GTO / Global Truck Online / Global Truck estão alinhados no frontend e backend;
- logout limpa a sessão GTO nativa antes do sign-out nativo;
- backend FIX18 permanece idempotente por sessionId/fingerprint;
- conclusão normal é registrada automaticamente;
- operação concluída orienta iniciar uma nova operação.

## Validações

- validate:gto-auto: 47/47
- alinhamento cruzado AI Studio ↔ Capacitor: 48/48
- TypeScript/TSX: 147/147 arquivos parseados sem erro sintático
- scripts JS/MJS/CJS: 5/5 parseados

A auditoria estrutural geral do Dev ainda aponta alguns arquivos sem caminho de execução e dependências diretas sem uso. São achados de limpeza herdados da base atual e não fazem parte do caminho crítico GTO; nenhum deles é necessário para a correção desta release.

## Publicação

Após importar no Google AI Studio, instalar dependências e publicar a função atual:

npm install
npm run setup:functions
npm run validate:gto-auto
firebase deploy --only functions:registerGtoTrip --project vtc-frota-log

