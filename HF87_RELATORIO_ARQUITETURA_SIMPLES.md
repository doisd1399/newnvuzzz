# NVU R3.34 PC HF87 — Arquitetura simples de captura contínua

## Objetivo

HF87 substitui a cadeia de provas de retorno por uma máquina simples de sessão única. A MediaProjection é iniciada uma vez após a autorização e permanece vinculada ao ObserverService durante a sessão. Trocas entre NVU, GTO e outros aplicativos não encerram nem pausam a captura.

## Causa raiz removida

As versões anteriores possuíam vários gates concorrentes: UsageStats, pacote foreground, `gtoForeground`, `screenAnalysisPausedOutsideGto`, sinais visuais, FPS e OCR de retorno. A captura podia continuar viva enquanto um desses sinais permanecia stale; o resultado era “transporte ativo, detector congelado”.

HF87 elimina essa ambiguidade. A continuidade do detector depende da sessão real de captura e de frames atuais, não da confirmação de que o GTO voltou por um mecanismo indireto.

## Máquina de estados

| Estado | Entrada | Comportamento |
|---|---|---|
| `CAPTURING` | VirtualDisplay criada ou frame recebido | Consome frames e atualiza heartbeat. |
| `RECOVERING` | Stall ou rebind de superfície | Reconecta o ImageReader ao mesmo VirtualDisplay, sem pedir autorização novamente. |
| `STOPPED` | `MediaProjection.Callback.onStop()` ou encerramento real | Fecha a sessão lógica e solicita nova autorização. |

A troca de aplicativo não muda o estado para `STOPPED`. A análise volta a considerar frames normalmente após a barreira de três frames estáveis. Detecção e ações continuam separadas: manter a captura não seleciona frete, não toca na tela e não inicia viagem sozinho.

## Diagnóstico mínimo publicado

O Observer registra `captureMachineState`, `captureMachineStateAt`, `captureLastFrameAt`, `captureLastAnalyzedAt`, `captureFrameCount`, `captureAnalyzedFrameCount`, `captureReaderIdentity`, `captureVirtualDisplayPresent`, `captureOnStopAt` e `captureStateReason`.

Esses indicadores permitem distinguir definitivamente entre ausência de frame, frame recebido sem análise, ImageReader substituído, VirtualDisplay ausente e revogação real.

## Evidências

A regressão HF87 confirmou a presença da máquina `CAPTURING/RECOVERING/STOPPED`, heartbeat, diagnóstico e ausência de gate de prontidão baseado em foreground/FPS/OCR. A simulação HF86 foi executada novamente com foreground stale, retorno sobre NVU, callback antigo, revogação real e polls repetidos; todos os cenários passaram. As regressões HF66–HF85 passaram.

A compilação Java e `assembleRelease` passaram. O APK foi zipaligned, assinado e verificado com v2/v3.

```text
package: com.nvu.operacional
versionCode: 138
versionName: 1.0.138
targetSdkVersion: 36
SHA-256: 9b5d6aae54706c1f60d884b89bfced9b90b2505f2c08a2896d849aefd1afc38d
```

## Limitação

Não há dispositivo Android/ADB disponível para executar o ciclo físico no GTO. A simulação valida a lógica de estados e os bloqueios estruturais, mas não substitui a validação de entrega de frames em um aparelho específico.
