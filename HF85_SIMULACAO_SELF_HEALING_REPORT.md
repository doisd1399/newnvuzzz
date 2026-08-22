# Simulação determinística do self-healing HF85

## Objetivo

A simulação verifica, sem dispositivo Android, se o mecanismo de self-healing mantém o observer consumindo frames, recupera a análise quando o foreground fica stale, não congela após exceções ou stalls transitórios e não altera a viagem apenas por manter o transporte ativo.

O modelo executado reproduz as condições relevantes do HF85: sessão MediaProjection autorizada, VirtualDisplay, ImageReader, handler, frames recentes, `gtoForeground`, pausa de análise, pacote foreground stale, superfície transitória, stall de frames e exceção do supervisor.

## Resultado geral

> **PASS HF85 SIMULATION:** 7 cenários executados; invariantes de não congelamento, rearmamento e segurança aprovadas.

| Cenário | Frames consumidos | Frames descartados | Rearmamentos | Mutações da viagem | Resultado |
|---|---:|---:|---:|---:|---|
| GTO estável | 180 | 0 | 0 | 1 decisão semântica | Observer contínuo |
| UsageStats stale com frames contínuos | 130 | 0 | 1 | 1 decisão semântica | Recuperado pelo fluxo contínuo |
| Foreground desconhecido com frames contínuos | 100 | 0 | 1 | 1 decisão semântica | Recuperado sem prova visual |
| Overlay transitório e retorno | 110 | 30 durante overlay | 1 | 1 decisão semântica | Overlay pausou análise; retorno recuperou |
| Stall de captura e recuperação | 80 | 0 após retomada | 1 | 1 decisão semântica | Observer recuperado quando os frames voltaram |
| Exceção transitória do supervisor | 80 | 0 | 1 | 1 decisão semântica | `finally` rearmou o supervisor |
| Continuidade sem mutação da viagem | 90 | 0 | 1 | 0 | Transporte não alterou o estado da viagem |

## Invariantes verificadas

A simulação confirmou que frames recentes e uma sessão autorizada impedem que o observer entre em cegueira permanente apenas porque o UsageStats está atrasado ou vazio. O callback de frame consegue reativar `gtoForeground` e limpar a pausa de forma idempotente, sem aguardar FPS, OCR, orientação ou uma prova visual específica.

Também foi confirmado que uma superfície transitória pode pausar a interpretação enquanto está presente, mas o observer não encerra nem perde a sessão; quando a superfície desaparece e os frames continuam, a análise volta. Quando o transporte realmente fica sem frames além do watchdog, a análise é bloqueada; assim que os frames retornam, o self-healing reabre o pipeline.

Por fim, a continuidade não produziu mutação de viagem no cenário de segurança. A simulação separa o rearmamento do transporte das decisões semânticas: manter o observer armado não confirma frete, não altera origem/destino/carga e não finaliza viagem.

## Evidência estrutural adicional

O script também verificou diretamente o fonte nativo e confirmou a presença de `hasLiveCaptureContinuity`, `keepObserverArmedDuringForegroundUncertainty`, `LIVE_CAPTURE_FRAME` e da barreira `captureStabilityGate`. Confirmou ainda a remoção de `scheduleReturnForegroundOcr` e `GtoReturnForegroundPolicy`, impedindo que o retorno volte a depender do OCR/FPS.

## Limitação

Esta é uma simulação determinística do contrato de estados e dos eventos do observer. Ela não reproduz o Android WindowManager, a implementação OEM de UsageStats, a entrega física do MediaProjection nem o comportamento visual do GTO. Portanto, prova a ausência dos deadlocks previstos no modelo HF85, mas não substitui a validação física em um aparelho Android real.

O relatório JSON bruto da execução está anexado separadamente para auditoria dos números por cenário.
