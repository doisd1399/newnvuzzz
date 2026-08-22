# NVU R3.34 PC HF85 — Self-healing contínuo da detecção

## Causa raiz

A falha não era apenas FPS, OCR ou UsageStats. O problema estrutural era que o supervisor tratava a incerteza do pacote em primeiro plano como perda da detecção. Mesmo quando MediaProjection, VirtualDisplay, ImageReader e frames recentes continuavam vivos, o ramo de fallback chamava `pauseScreenAnalysisOutsideGto`, zerava `gtoForeground` e fazia o pipeline decisório rejeitar callbacks. O transporte continuava ativo, mas o observador ficava em um estado de “captura viva e detecção bloqueada”.

Esse estado podia persistir até que uma prova externa específica aparecesse, criando dependência circular e oscilação após sair e voltar ao GTO.

## Solução HF85

HF85 separa três responsabilidades:

| Camada | Comportamento HF85 |
|---|---|
| Transporte | MediaProjection, VirtualDisplay, ImageReader, handler e frames recentes permanecem sob supervisão contínua. |
| Contexto | Incerteza de foreground não encerra nem pausa permanentemente o observador quando o transporte autorizado continua vivo. |
| Decisão | OCR, detector visual, estabilidade e validação semântica continuam sendo os únicos responsáveis por alterar a viagem. |

Foi implementado `hasLiveCaptureContinuity`, limitado pelo timestamp real do último frame, e `keepObserverArmedDuringForegroundUncertainty`. O supervisor não transforma UsageStats stale em cegueira permanente quando há frames atuais. O próprio callback de frame também reativa `gtoForeground`, limpa a pausa e chama `resumeScreenAnalysisInSameState` de forma idempotente, sem depender de FPS, OCR, orientação ou prova visual específica.

A barreira de estabilidade continua ativa. Portanto, manter o observador armado não autoriza aceitar frete, confirmar origem/destino/carga ou finalizar viagem por si só; essas ações permanecem protegidas pelos gates semânticos já existentes.

## Evidências

Passaram as regressões HF85, HF84, HF83/HF84, HF74, HF82, HF81, HF80, HF79, HF78, HF77, HF70, HF69, HF72, HF71 e HF66. A nova regressão HF85 verifica continuidade de captura, self-healing no supervisor e no primeiro frame, ausência de `GtoReturnForegroundPolicy`/FPS/OCR e preservação da barreira de estabilidade.

Também passaram:

```text
:app:compileDebugJavaWithJavac — BUILD SUCCESSFUL
:app:assembleRelease — BUILD SUCCESSFUL
```

Identidade do APK:

```text
package: name='com.nvu.operacional' versionCode='136' versionName='1.0.136'
targetSdkVersion:'36'
```

Assinatura v2/v3 verificada.

SHA-256:

```text
421580be294fe6022d35db25ba62ad7c73a2a758205e2fb819f5463066f9c5c2
```

## Limitação

Não há dispositivo Android/ADB disponível para executar fisicamente o ciclo `NVU → GTO → sair → retornar → detectar`. As evidências são de auditoria estrutural, regressões automatizadas, compilação, assinatura e identidade do pacote. A validação final em aparelho real continua necessária para medir o comportamento específico do OEM e do GTO.
