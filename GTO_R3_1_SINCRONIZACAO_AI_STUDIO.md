# Sincronização GTO R3.1 — Google AI Studio

Data: 2026-08-11

## Objetivo

Sincronizar seletivamente o Dev atual do Google AI Studio com o contrato do APK/Capacitor GTO FIX18 R3.1, preservando a arquitetura web mais recente do Dev e evitando substituir a pasta `src` inteira.

## Alterações aplicadas

- `src/lib/gtoObserver.ts`
  - contrato R3.1 completo;
  - recuperação do observador (`recoverObserver`);
  - limpeza nativa no logout (`logoutCleanup`);
  - heartbeat/saúde do serviço;
  - diagnóstico de overlay;
  - etapas exibidas ao motorista;
  - contexto de status/progresso/total da operação;
  - alias `Global Truck`.
- `src/services/gtoWorkLauncher.ts`
  - recuperação segura do serviço;
  - confirmação da saúde do observador antes de abrir o GTO;
  - bloqueio de operação pendente/não iniciada;
  - bloqueio de operação concluída ou que atingiu o total de entregas;
  - reenvio do contexto depois da recuperação/inicialização;
  - compatibilidade de migração com APKs anteriores quando `recoverObserver` não existir.
- `src/pages/driver/Dashboard.tsx`, `Profile.tsx`, `RecordTrip.tsx`
  - envio de `jobStatus`, `jobProgress` e `jobTotalDeliveries` para a camada nativa;
  - mensagens para operação não iniciada, encerrada ou observador instável;
  - orientação de finalização automática na tela de trabalho GTO.
- `src/context/AppContext.tsx`
  - `GtoObserver.logoutCleanup()` executado antes de revogar a autenticação;
  - entrega já confirmada permanece na fila durável; rota incompleta é descartada no logout;
  - fallback seguro para APK antigo sem esse método.
- `functions/src/gtoTrips.ts`
  - backend reconhece `GTO`, `Global Truck Online` e `Global Truck` com o mesmo contrato.
- `src/lib/resolveSimulator.ts`, `tripDistance.ts`, `simulatorOptions.ts`
  - aliases GTO uniformizados em todas as rotas de resolução.
- Limpeza segura da raiz
  - removidos `bun.lock` vazio e scripts temporários `patch_plan.*`, `test_patch.*` e `test_plan.ts`;
  - nenhum deles fazia parte do caminho de execução do aplicativo.

## Preservado

Não foram substituídas as áreas mais novas do Dev do Google AI Studio. Ranking, autenticação, notificações, contexto empresarial, cadastro, páginas administrativas e demais fluxos permanecem na versão do Dev atual.

A implementação nativa de OCR, detecção de frete, cancelamento/reinício de rota, finalização automática e botão flutuante continua pertencendo ao projeto Capacitor/Android R3.1.

## Validação

- Validador web/Firebase GTO: 47/47 verificações aprovadas.
- Parser TypeScript dos 11 arquivos alterados: 11/11 aprovados.
- Parser TypeScript global: 146/146 arquivos `.ts/.tsx` comuns aprovados; `vite-env.d.ts` não é transpilável por definição e foi ignorado.
- A auditoria estrutural deixou de apontar os seis artefatos temporários da raiz que já existiam no Dev original. Permanecem apenas avisos de arquivos órfãos antigos não relacionados à sincronização GTO e dependências sem uso; nenhuma nova falha estrutural foi introduzida.
- O build completo não foi executado neste ambiente porque o cache npm local não contém todas as dependências e o download externo não ficou disponível durante a validação.

## Ordem de publicação

1. Importar/sincronizar este Dev no Google AI Studio.
2. Publicar o web app conforme o fluxo atual do projeto.
3. Publicar `functions:registerGtoTrip` no Firebase `vtc-frota-log`.
4. Em seguida alinhar o projeto Capacitor com este Dev e gerar o APK release definitivo.
