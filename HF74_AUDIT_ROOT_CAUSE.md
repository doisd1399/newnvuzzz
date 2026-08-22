# HF74 — Auditoria do retorno ao GTO

## Evidências objetivas

1. `GtoObserverService.updateCaptureHealthIndicator()` usava `isCaptureTransportHealthy(now)`. Esse predicado exigia recursos MediaProjection, `lastProjectionFrameAt` e `lastProjectionAnalyzedFrameAt` recentes, mas não exigia `gtoForeground`, `screenAnalysisPausedOutsideGto == false` nem `captureStabilityGate.isReady()`.

2. O caminho `consumeCaptureStabilityFrame()` executado durante o retorno ao GTO chama `fastVisualDetector.analyze(...)` e atualiza `lastProjectionAnalyzedFrameAt`/`screenRecognitionHeartbeatAt` antes da barreira `GTO_READY`. Portanto, o ponto branco e o campo `detectorActive` podiam ser promovidos por uma sonda pré-pronta enquanto o pipeline decisório ainda permanecia bloqueado.

3. O `GtoObserverPlugin` calculava `detectorActive` apenas por `isRunning`, `enabled`, `projectionActive` e `screenRecognitionHeartbeatAt` recente. Isso era ainda mais fraco que a bolinha do serviço e podia expor “detector ativo” enquanto o GTO ainda não tinha passado pela barreira de três frames estáveis.

4. O retorno já possuía uma barreira correta: `resumeScreenAnalysisInSameState()` reseta `GtoCaptureStabilityGate` para `CAPTURE_WAITING_STABLE_FRAMES`; `onImageAvailable()` mantém o caminho decisório atrás de `isCaptureReadyForAnalysis()`; e a prova visual de lista pode restaurar o foreground após evidência atual. O problema principal não era a existência da barreira, mas o contrato de saúde/UI ignorá-la.

5. A ponte `projectionVerifiedGtoBridgeActive` era armada na autorização GTO, mas não era restaurada de SharedPreferences em `onCreate()`. Em recriação do serviço, UsageStats atrasado podia impedir `mayProbeFreightReturnDuringForegroundLag()` mesmo havendo token/display e lista visual atual. HF74 passa a restaurar esse vínculo persistido, mantendo as proteções da política que rejeitam apps terceiros e superfícies transitórias.

## Correção aplicada até aqui

- A bolinha usa `isCapturePipelineHealthy(now)`, que exige projeção/token/display/reader/handler, GTO em primeiro plano, análise não pausada, `GTO_READY`, frames recentes e análise recente.
- `isDetectorActive()` usa a mesma fonte de verdade.
- O plugin consulta `GtoObserverService.isDetectorOperationalNow()` e expõe separadamente o heartbeat de sondagem (`detectorProbeHeartbeatAt`) e a saúde real (`captureHealth`).
- O contrato TypeScript foi atualizado com os novos campos.
- A ponte verificada de projeção é restaurada no `onCreate()`.
- Foi criada a regressão HF74 e o teste unitário da política de saúde; ambos passam.

## Limitação de validação end-to-end

O sandbox não possui `adb` nem dispositivo/emulador Android conectado. Portanto, ainda não há evidência física do ciclo NVU → GTO → saída → retorno → lista → seleção. APK release não deve ser gerado ou entregue como corrigido até que os testes estáticos, compilação e, idealmente, uma execução no Android real estejam concluídos; se o ambiente Android real continuar indisponível, isso deve ser declarado explicitamente no relatório final.
