# NVU R3.34 PC HF89 — Autoridade única de detecção e botão externo

## Causas raiz confirmadas

A primeira causa raiz do piscamento e da queda aparente era estrutural: `GtoCaptureStabilityGate.observeFrame` tratava `hasFreshGtoForegroundEvidence=false` como perda da detecção. Bastava UsageStats ficar stale, o latch NVU permanecer ativo ou uma prova visual atrasar para o gate zerar `stableFrames`, sair de `GTO_READY` e interromper o caminho decisório, embora MediaProjection, VirtualDisplay, ImageReader e frames continuassem vivos.

A segunda causa raiz afetava o botão. `keepFrameAnalysisSessionActive` promovia qualquer sessão MediaProjection viva para `gtoForeground=true` e chamava `resumeScreenAnalysisInSameState`. O supervisor então executava `disarmBubbleStopForCurrentGesture`, ocultando o alvo **Remover e parar NVU**. O transporte de captura e o contexto de foreground estavam sendo tratados como a mesma coisa.

## Correção HF89

A barreira agora recebe `captureSessionActive`, não evidência de foreground. Uma sessão autorizada mantém a estabilidade por frames e geometria; somente sessão inativa entra em `INACTIVE`. Foreground, pacote, FPS, OCR e bridge não podem resetar uma sessão de captura viva.

O classificador visual leve passa a rodar por sessão e frame, sem depender de `captureIsNeededForCurrentState()`. A leitura de telas nunca fica sem classificador apenas porque o estado da viagem está IDLE ou porque ocorreu uma troca de aplicativo. A decisão de alterar viagem ou tocar na interface continua separada e protegida pelo reducer/estado semântico.

A bolinha e `isDetectorOperationalNow()` usam a mesma fonte: `isDetectorSessionOperational`, baseada em MediaProjection/VirtualDisplay/ImageReader/Handler e timestamps recentes de frame e análise. Portanto, o indicador não pisca por foreground stale; ele só deixa de ser operacional quando o transporte ou a análise deixam de produzir frames reais além da janela de watchdog.

O self-healing agora é telemetria de transporte. Ele não escreve `gtoForeground`, não retoma contexto visual e não autoriza ações. O supervisor só promove foreground com pacote GTO real ou prova visual estrita atual.

No botão, HF89 preserva o contrato HF86: `bubbleGestureStartedOutsideGto = !gtoForeground`. O alvo de remoção e o commit continuam exigindo gesto fora do GTO, pointer, geração, destaque, geometria e release fresco. Uma bridge stale não cancela um gesto ativo.

## Máquina determinística

| Fonte | Pode manter captura/análise | Pode promover foreground | Pode remover o botão |
|---|---:|---:|---:|
| MediaProjection + frames recentes | Sim | Não | Não |
| UsageStats/bridge stale | Não decide | Não | Não |
| Pacote GTO real | Sim | Sim | Não |
| Lista de fretes visual estrita | Sim | Sim após confirmação | Não |
| Gesto externo válido | Não altera captura | Não | Sim, após drop validado |
| `MediaProjection.Callback.onStop()` | Encerra | Não | Não |

## Evidências

A regressão HF89 passou, a compatibilidade HF88/HF86 do arraste passou, a simulação de sessão passou, o teste unitário `GtoCaptureStabilityGateTest` passou e as regressões HF66–HF88 passaram. A compilação Java e `assembleRelease` passaram. O APK foi zipaligned, assinado e verificado com assinatura v2/v3.

```text
package: com.nvu.operacional
versionCode: 140
versionName: 1.0.140
targetSdkVersion: 36
SHA-256: a1411b193d126fed2794f4b4d412a3fe5652367eb47f228cad932edaf0f4fdc5
```

## Limitação

Não há dispositivo Android/ADB disponível para executar fisicamente o ciclo NVU → fora do GTO → retorno ao GTO. As regressões comprovam os contratos estruturais, a não oscilação lógica e a preservação do gesto, mas não substituem a validação em um aparelho real.
