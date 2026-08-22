# Diagnóstico HF89 — correções sem efeito observável

## Conclusão

O APK HF89 foi compilado e assinado corretamente como `com.nvu.operacional`, `versionCode 140`, `versionName 1.0.140`. Portanto, não há evidência de erro de compilação no artefato entregue. Entretanto, a correção HF89 não alcançou a autoridade completa que libera a detecção e as ações. Ela corrigiu a leitura do indicador e o método de observação da barreira, mas deixou gates antigos ativos na rota de retorno e na rota de decisões.

## Causas técnicas identificadas

| Camada | Comportamento que permaneceu | Efeito no aparelho |
|---|---|---|
| Retorno ao GTO | `rawGto` e `rearmGtoForegroundFromAuthorizedReturn` ainda dependem de `foregroundPackage == GTO_PACKAGE` ou de prova visual recente | Se UsageStats atrasar, o contexto não é rearmado no momento do retorno |
| Geometria | `isFrameAnalysisSessionActive()` exige `captureWidth > captureHeight`; `isCaptureReadyForAnalysis()` exige ainda `captureGeometryMatchesCurrentDisplay()` | A sessão pode receber frames, mas continuar logicamente não pronta quando a geometria/resize fica stale |
| Reentrada | `resumeScreenAnalysisInSameState()` reseta a barreira para três frames; `resizeProjectionSurface()` reseta novamente para orientação/estabilidade | A tela volta, mas a rota decisória fica aguardando uma sequência que pode não completar se o callback de resize falhar ou atrasar |
| Saúde do supervisor | `GtoCaptureHealthPolicy.isHealthy()` ainda exige `gtoForeground`, `!analysisPaused` e `stabilityReady` | O supervisor pode declarar recuperação mesmo com frames/análise vivos e tentar reparar a superfície |
| Ações | O sensor de toque e `queueFreightTouchMarker()` ainda exigem `gtoForeground` e `captureStabilityGate.isReady()` | A lista pode ser visualmente detectada sem aceitar seleção ou iniciar a próxima etapa |
| Testes | HF89 testa presença/ausência de strings e o gate isolado; não executa o ciclo com UsageStats stale, resize atrasado e ação pendente | O teste pode passar mesmo quando o aparelho mantém a rota em recuperação |
| Metadados | `NVU_RELEASE_METADATA.json` ainda informa HF88, Android 1.0.139 e versionCode 139 | Pipeline/manual de instalação pode selecionar ou identificar a versão anterior, apesar do APK HF89 ser 1.0.140 |

## Sequência provável da falha

Ao sair do GTO, o serviço marca a análise como pausada e invalida evidências antigas. Ao retornar, o ImageReader pode continuar entregando frames, e o classificador leve chega a executá-los. Contudo, se UsageStats não publicar imediatamente o pacote GTO, `rawGto` permanece falso. Em paralelo, a retomada reabre a barreira de estabilidade; se a largura/altura capturada não coincidir com a métrica atual, o fluxo entra em `CAPTURE_WAITING_ORIENTATION` ou `RECOVERING_RESIZE`. O indicador HF89 foi alterado para usar o heartbeat, mas a prontidão da análise, o supervisor e o sensor de seleção continuam dependentes dos gates antigos. O resultado percebido é exatamente “há bolinha/frames, mas a lista ou a ação não funcionam”.

## Por que a correção anterior pareceu validada

A regressão HF89 apenas confirma que `GtoCaptureStabilityGate` recebe `captureSessionActive`, que a bolinha consulta `isDetectorSessionOperational`, que o self-healing não atribui `gtoForeground=true` e que o detector visual existe no caminho. Ela não instancia o fluxo inteiro nem verifica que uma lista detectada com `foregroundPackage` stale chega à seleção, ao menu pause e à transição de viagem. O teste unitário confirma somente a máquina de estabilidade.

## Evidência que falta para fechar o diagnóstico do aparelho

O ambiente de build não possui ADB nem um dispositivo Android. Assim, não é possível afirmar se o aparelho está executando o APK 1.0.140 ou uma versão anterior, nem se o Android está emitindo `MediaProjection.Callback.onStop()` ou falhando no resize. A confirmação mínima é uma captura do menu de diagnóstico do NVU mostrando `versionName`, `versionCode`, `projectionStatus`, `captureReadiness`, `captureHealth`, `captureWidth`, `captureHeight`, `foregroundPackage`, `captureLastFrameAt` e `captureLastAnalyzedFrameAt` imediatamente após retornar ao GTO.

## Próxima correção necessária

Não é seguro apenas aumentar timeout ou adicionar mais uma prova de foreground. A correção precisa separar definitivamente: (a) transporte de frames, (b) contexto visual do GTO e (c) autorização de ações. A saúde do transporte não pode chamar a política antiga que exige foreground; a geometria stale não pode tornar a sessão inteira inativa; e a seleção deve usar uma autoridade de frame atual, não o latch de foreground. Em seguida, é necessário atualizar os metadados para HF89/1.0.140 e criar uma regressão de execução simulando pacote stale, callback de resize ausente e frames contínuos.
