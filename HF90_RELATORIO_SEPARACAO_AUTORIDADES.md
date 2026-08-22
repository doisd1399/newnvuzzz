# NVU R3.34 PC HF90 — Separação de autoridades e correção de condições de corrida

## Escopo

A HF90 corrige a contradição estrutural identificada na HF89: transporte de frames, contexto do GTO, geometria da captura e autorização de ações não podem compartilhar a mesma autoridade. O transporte agora permanece saudável e analisando frames mesmo quando UsageStats, foreground ou DisplayMetrics estão atrasados; somente as decisões de interface exigem evidência visual atual e geometria válida.

## Alterações aplicadas

| Camada | Implementação HF90 | Resultado esperado |
|---|---|---|
| Transporte | `GtoCaptureHealthPolicy.isTransportHealthy()` usa somente autorização, recursos vinculados e heartbeats recentes | Foreground stale não dispara recuperação nem torna a captura falsa |
| Sessão | `isFrameAnalysisSessionActive()` não exige mais paisagem; exige apenas recursos e dimensões positivas | Frames portrait/stale continuam chegando ao classificador |
| Frame atual | `reconcileLiveCaptureFromFrame()` reconcilia `projectionActive` quando o ImageReader atual entrega frame | Retorno não depende exclusivamente do evento de UsageStats |
| Geometria | `reconcileCaptureGeometryFromFrame()` atualiza dimensões a partir do ImageReader e reabre a estabilidade local | Resize atrasado não mantém a análise presa indefinidamente |
| Prontidão | `isCaptureReadyForAnalysis()` não depende mais de `DisplayMetrics` | A análise usa a geometria efetiva do frame |
| Supervisor | `transportReady`, `transportStatus` e `shouldRepairBoundTransport` não exigem foreground | Reparo continua possível durante a oscilação do pacote |
| Sensor | Listener passivo permanece anexado enquanto o transporte está saudável | Troca de aplicativo não perde o observador de toque |
| Ações | `isCurrentGtoActionContext()` exige heartbeat, estabilidade, ausência de superfície transitória e evidência visual fresca | Frames fora do GTO não geram ações; pacote stale não bloqueia uma tela GTO comprovada |
| Versão | `versionCode 141`, `versionName 1.0.141`, metadados HF90 | O artefato instalado fica distinguível do HF89/HF88 |

## Regressões executadas

Passaram as regressões HF90, HF89, HF74 e o teste unitário da barreira. A nova regressão verifica que o pipeline não chama a política de saúde acoplada a foreground, que a sessão não depende de orientação, que a prontidão não depende de DisplayMetrics stale, que o frame atual reconcilia transporte/geometria e que as ações usam evidência visual atual.

A compilação `:app:compileDebugJavaWithJavac` e `:app:assembleRelease` passaram. O APK release foi zipaligned e assinado com o keystore fornecido, com verificação positiva pelas assinaturas v2 e v3.

## Identidade e hash

```text
package: com.nvu.operacional
versionCode: 141
versionName: 1.0.141
targetSdkVersion: 36
SHA-256 do APK: a5b93e2c62639e542c72d7bd25d69261db08afe8e67b95bab4e5428afcf95969
```

## Limitação de validação

Não há dispositivo Android nem ADB disponível no ambiente. As validações comprovam a arquitetura, os contratos de concorrência e a compilação do artefato, mas não substituem o teste físico NVU → GTO → sair → retornar → lista de fretes → seleção. A validação em aparelho deve conferir o diagnóstico `captureHealth`, `captureReadiness`, `captureGeometrySource`, `captureFrameReconciledAt`, `captureLastFrameAt` e `captureLastAnalyzedFrameAt`.
