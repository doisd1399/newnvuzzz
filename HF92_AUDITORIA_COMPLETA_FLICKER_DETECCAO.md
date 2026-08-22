# HF92 — Auditoria completa da oscilação da detecção e da bolinha branca

## Conclusão executiva

A bolinha branca ainda pisca porque a HF91 corrigiu o contexto externo e o gesto, mas não eliminou a **realimentação negativa entre watchdog, rebind de superfície, timestamps de heartbeat e indicador visual**. O indicador é recalculado a cada 350 ms por `isDetectorSessionOperational()`. Essa função exige que `lastProjectionFrameAt` e `lastProjectionAnalyzedFrameAt` permaneçam recentes. Quando o analisado fica stale por aproximadamente 4,2 segundos, o supervisor autoriza um rebind; o rebind zera os dois timestamps e reinicia a barreira. O indicador então fica cinza até os próximos frames/análises. Quando a análise volta, ele fica branco novamente. Repetições desse ciclo aparecem exatamente como piscadas de detector caindo e sendo recuperado.

A simulação temporal HF92 reproduziu duas recuperações e as transições:

```text
HEALTHY_REAL_DETECTOR → NOT_HEALTHY → HEALTHY_REAL_DETECTOR
HEALTHY_REAL_DETECTOR → NOT_HEALTHY → HEALTHY_REAL_DETECTOR
```

A simulação não substitui um aparelho, mas comprova que o contrato temporal atual permite a oscilação mesmo quando a MediaProjection permanece viva.

## Causas raiz confirmadas

| Prioridade | Causa | Evidência no código | Efeito |
|---|---|---|---|
| Crítica | Watchdog de análise curto e rebind destrutivo | `GtoCaptureHealthPolicy`: análise stale após 4.200 ms; `repairPartialProjectionSurfaceWithoutReauthorization()` e `rebindProjectionSurfaceWithoutReauthorization()` zeram `lastProjectionFrameAt` e `lastProjectionAnalyzedFrameAt` | A bolinha fica não saudável durante cada rebind e volta depois |
| Crítica | Ausência de histerese no indicador | `updateCaptureHealthIndicator()` aplica imediatamente cada transição de `isDetectorSessionOperational()` | Uma única janela de análise atrasada muda a cor sem confirmação temporal adicional |
| Crítica | Condição de corrida entre threads | ImageReader/captureHandler escrevem timestamps e flags; foregroundPoll lê os mesmos campos. `lastProjectionFrameAt`, `lastProjectionAnalyzedFrameAt`, `projectionActive`, `imageReader`, `virtualDisplay`, `captureWidth` e `captureHeight` não são `volatile` nem publicados por um snapshot atômico | O Handler principal pode ler valor stale e marcar detector como não operacional, mesmo após a captura ter avançado |
| Alta | Rebind não possui estado `RECOVERY_IN_FLIGHT` nem grace period | O supervisor pode autorizar recuperação novamente após o cooldown, enquanto o primeiro ImageReader ainda está sendo substituído | Sobreposição de rebinds, callbacks antigos e lacunas de frames |
| Alta | Várias autoridades alteram readiness | `updateCaptureHealthIndicator`, `isObserverOperationalReady`, `updateObserverLifecycleStatus`, `enforceOperationalReadiness` e `GtoObserverPlugin.buildStatus()` expõem/consomem estados diferentes | A bolinha, o menu e o status podem divergir durante a mesma recuperação |
| Alta | Barreira de estabilidade é resetada por múltiplos caminhos | Retorno, resize, rebind, reconciliação de geometria e `becameUnready` chamam `resetCaptureStabilityBarrier()` ou `invalidateCaptureBoundAnalysis()` | A captura continua recebendo frames, mas decisões ficam repetidamente em `WAITING_STABLE_FRAMES` |
| Alta | A sessão autorizada ainda depende de paisagem em rotas residuais | `hasAuthorizedCaptureSession()`, `shouldKeepDetectorAliveDuringForegroundLag()` e `mayProbePausedFreightReturn()` exigem `captureWidth > captureHeight` | Geometria stale/portrait pode tirar o frame do caminho de análise contínua, mesmo após HF90 remover essa dependência da autoridade principal |
| Média | Callback antigo é descartado sem handoff observável | `onImageAvailable()` retorna quando `reader != imageReader`; durante substituição, o frame não é analisado e não há contador de lacunas por geração | A troca de ImageReader parece uma queda intermitente sem diagnóstico preciso |
| Média | Detector visual síncrono no Handler de captura | `fastVisualDetector.analyze()` percorre buffers, detecta botões e calcula assinaturas no mesmo caminho do ImageReader | Em aparelhos lentos, o callback pode atrasar; o watchdog interpreta a fila atrasada como perda de análise |
| Média | Uso de UsageStats e prova visual com janelas diferentes | Poll de foreground: 350 ms; prova visual: 2.400 ms; eventos UsageStats podem chegar atrasados ou fora de ordem | O contexto pode alternar entre GTO, externo e desconhecido enquanto a captura continua viva |

## O que não é a causa principal

A simples mudança de foreground não encerra diretamente a MediaProjection na implementação atual. A HF91 corrigiu a ausência de demotion de `gtoForeground` e o alvo de remoção. Entretanto, a mudança ainda pode acionar resets de contexto, barreira e sensores. Portanto, o problema atual não deve ser tratado reintroduzindo uma dependência de foreground na saúde do transporte.

Da mesma forma, `GTO_READY` não é a autoridade correta para a bolinha. Ele é uma barreira para decisões e coordenadas. Usá-lo para o indicador voltaria a misturar “captura viva” com “ações prontas” e recriaria o problema anterior.

## Fluxo atual que produz o flicker

```text
ImageReader entrega frames
        ↓
Analyzer deixa de marcar heartbeat por atraso, corrida ou caminho residual
        ↓
lastProjectionAnalyzedFrameAt ultrapassa 4.200 ms
        ↓
shouldRecoverSurface() autoriza rebind
        ↓
ImageReader é substituído; timestamps são zerados
        ↓
updateCaptureHealthIndicator() lê NOT_HEALTHY
        ↓
primeiros frames novos marcam análise
        ↓
indicador volta a HEALTHY_REAL_DETECTOR
        ↓
qualquer novo atraso repete o ciclo
```

A reprodução HF92 usou os mesmos timeouts do código e obteve duas transições de recuperação em 24 segundos. Isso explica por que os testes estruturais HF89–HF91 passaram: eles verificam contratos e presença de regras, mas não executam uma sequência temporal com atraso de análise, rebind, geração, primeiro frame e estabilização.

## Correção definitiva recomendada

A solução não é simplesmente aumentar o timeout ou deixar a bolinha branca permanentemente. É necessário separar **estado físico do transporte**, **estado do analisador**, **estado de recuperação** e **estado visual do indicador**.

| Componente | Correção necessária |
|---|---|
| Snapshot compartilhado | Criar um `CaptureRuntimeSnapshot` imutável, publicado por `AtomicReference`, contendo geração, identidade do ImageReader, último frame, última análise, estado de recuperação e contadores. O foregroundPoll nunca deve ler campos espalhados entre threads |
| Heartbeats | Atualizar frame/análise somente pelo executor do capture. O indicador lê o snapshot atômico, não variáveis longas compartilhadas diretamente |
| Recuperação | Adicionar `RECOVERY_IN_FLIGHT` por geração e identidade de reader. Enquanto o rebind estiver pendente, nenhuma segunda recuperação pode iniciar |
| Rebind | Não zerar o heartbeat anterior antes de confirmar a troca. Marcar `candidateReader`, aguardar o primeiro frame do candidato e promover somente após confirmação; em falha, manter o reader anterior quando possível |
| Histerese | Exigir, por exemplo, três polls consecutivos não saudáveis ou uma janela contínua maior para apagar o branco; exigir dois frames analisados consecutivos para reacender. Um atraso isolado não deve trocar a cor |
| Indicador | Usar uma única máquina visual: `UNKNOWN`, `CAPTURING`, `RECOVERING`, `STOPPED`. O branco significa transporte e análise comprovados; `RECOVERING` não deve alternar a cor a cada poll |
| Geometria | Remover `captureWidth > captureHeight` de `hasAuthorizedCaptureSession()`, `shouldKeepDetectorAliveDuringForegroundLag()` e `mayProbePausedFreightReturn()`. Paisagem deve proteger coordenadas, não o consumo de frames |
| Estabilidade | Resetar a barreira somente quando houver nova geração, mudança de dimensão confirmada ou primeiro retorno real. Repetições idempotentes do mesmo evento não podem gerar nova geração |
| Detector | Medir duração de `fastVisualDetector.analyze()` e limitar trabalho no callback do ImageReader. O callback deve publicar frame e enviar análise leve para uma fila própria, evitando bloquear a entrega física |
| Contexto | UsageStats, lifecycle e prova visual devem publicar eventos; nenhum desses eventos pode zerar heartbeat, trocar reader ou tornar o transporte não saudável |
| Diagnóstico | Registrar `captureGeneration`, `readerIdentity`, `lastFrameAt`, `lastAnalyzedAt`, `recoveryState`, `recoveryStartedAt`, `recoveryConfirmedAt`, `droppedOldReaderFrames`, `analysisDurationMs` e motivo de cada transição |

## Critérios de aceitação obrigatórios

A correção só deve ser considerada concluída quando a simulação temporal demonstrar que uma análise atrasada não produz alternância rápida do indicador, que uma recuperação em andamento não pode ser duplicada e que o primeiro frame do novo reader confirma a geração antes de o reader antigo ser descartado.

No aparelho, o ciclo deve ser repetido várias vezes: NVU → GTO → outro aplicativo → GTO → lista de fretes → seleção → menu pause → retorno. Durante todo o ciclo, deve ser possível distinguir no diagnóstico entre `CAPTURING`, `RECOVERING` e `STOPPED`. A bolinha não pode apagar por um único poll stale, mas também não pode permanecer branca quando `onStop()` realmente invalidar a MediaProjection.

## Limitação da auditoria

Não há dispositivo Android/ADB neste ambiente. A auditoria identificou causas concretas no código e reproduziu a alternância temporal por simulação determinística, mas não pode afirmar qual evento físico do OEM dispara a primeira lacuna — atraso do Handler, callback de resize, troca do ImageReader ou latência do detector. Para fechar essa última distinção, o APK precisa expor o diagnóstico por geração e ser executado no aparelho durante o ciclo real.
