# Auditoria HF123 — evidências

## Estado reproduzido nos dumps

Os dumps `android/gto-before.txt`, `android/gto-after.txt` e `android/gto-state.txt` mostram uma sessão em `WAITING_FREIGHT` com `screenState=FREIGHT_LIST` e cinco opções visualmente estruturadas, enquanto o painel de operação mantém `gtoTripSyncStatus=IN_PROGRESS` e `gtoTripIntegrityStatus=CONTEXT_LOCKED`. A fila/ACK anterior não aparece como autoridade para bloquear a nova sessão; o marcador de fila independente é apenas diagnóstico de uma entrada antiga.

O campo `gtoCanonicalStateError=NOT_FOUND`, com `gtoCanonicalStatePending=true` e `gtoCanonicalPendingFrom=CONFIRMING_FREIGHT`, confirma falha do espelho canônico, mas o código de captura/seleção não lê esse erro como gate direto. O estado remoto pode rejeitar a transição por sessão inexistente, `expectedState` divergente ou pré-condição inválida.

O valor mais relevante para a seleção é a combinação de `pendingSelectionSource=touch-marker`, `selectionSource=touch-marker+frame-lock`, `selectionTouchSequence=461` e `freightTouchSequence` crescente. Isso demonstra que a lista chegou a ser processada e que o sensor recebeu marcador de toque, mas não há evidência persistida de que um candidato de linha tenha sido finalizado.

## Constatações no código

1. `queueFreightTouchMarker()` recusa novos marcadores enquanto `selectionCoordinator.isCriticalWindow()` está ativo.
2. `armFastTouchPulseOnCaptureThread()` abre o `criticalWindow`; ele é fechado apenas por `clearFastTouchPulse()`/`selectionCoordinator.finishCriticalWindow()`.
3. Existe expiração de `fastTouchPulseActive` após `CRITICAL_TOUCH_WINDOW_MS` somente dentro do caminho que processa novos frames da lista. Se o produtor fica sem frames, a limpeza não ocorre naquele momento; ao voltar, o primeiro frame pode carregar o marcador antigo.
4. `clearFastTouchPulse()` e `clearFastPendingSelection()` limpam o estado em memória, mas não removem `pendingSelectionSource` nem `freightTouchPulseAt` persistidos. Assim, o painel pode continuar exibindo `touch-marker` após a tentativa ter expirado, mascarando o estado real.
5. O sensor físico pode permanecer visível enquanto `touchCaptureNeeded=false`: `updateFreightTouchPulseSensor()` mantém o observador passivo durante a sessão habilitada e saudável; visibilidade do sensor não significa que uma seleção está armada.
6. O contexto visual exige três frames compatíveis da mesma assinatura coarse. HF122 já removeu coordenadas exatas dessa assinatura; `freightCount=5`/`screenState=FREIGHT_LIST` indica que o detector visual passou pelo caminho da lista em pelo menos parte do ciclo.
7. `setTripState()` sempre inicia espelho canônico assíncrono; falhas são persistidas e classificadas, mas não alimentam diretamente `GtoActionStateMachine`. O backend atual retorna `HttpsError` que o CLI reduz a HTTP 400, sem motivo detalhado nos logs disponíveis.
8. `GtoAutoTripSync` persiste ACK antes da remoção da fila. Falha de limpeza mantém a entrada, mas o callback chama `onSynced`, e a sessão atual pode ser liberada; portanto, a fila antiga explica o texto visual, não deve bloquear a nova seleção.

## Hipótese principal a validar em HF123

O bloqueio observável não é “lista não detectada” em sentido estrito. É uma divergência entre lista reconhecida e seleção não finalizada: uma tentativa de toque abre uma janela crítica temporal, a transição visual da linha não é capturada ou não coincide com a coordenada, e o marcador persistido continua visível. O retorno entre aplicativos também pode deixar um marcador de toque antigo ativo até o primeiro frame seguinte. O teste HF123 deve modelar e cobrir limpeza determinística da janela no retorno/novo ciclo, preservação de fila independente e erro canônico não bloqueante.

## Limite de evidência atual

Ainda não há prova suficiente para declarar a causa única sem teste de comportamento. Não gerar APK antes de implementar o modelo HF123, executar as regressões HF119–HF123 e concluir a auditoria do caminho real de seleção/ACK.

## Logs Firebase

A consulta de `syncGtoTripState` em 2026-08-22 04:50–04:51 UTC encontrou várias chamadas com `auth=VALID`, `app=MISSING` e HTTP 400. O Firebase CLI não exibiu a mensagem da `HttpsError`; não foi feita mudança/deploy de produção para instrumentar logs nesta etapa.

## Ambiente

Projeto: `NVU-R3.34-PC-HF65-TRIP-PIPELINE-FIX`; fonte atual `versionCode 172`, `versionName 1.0.172`. O diretório não contém metadados Git; alterações serão controladas por diffs/artefatos locais.
