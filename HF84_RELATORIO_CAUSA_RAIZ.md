# NVU R3.34 PC HF84 — Retorno ao GTO sem FPS/OCR como prova

## Causa raiz

A versão HF83 tentou confirmar o retorno ao GTO usando OCR de sinais como `FPS` e `km/h`. Essa abordagem era inválida: o `FPS` observado podia pertencer ao aparelho, à camada de captura ou a outro overlay, e não ao simulador. Portanto, a imagem não era uma autoridade confiável para identificar o retorno.

## Correção aplicada

HF84 remove completamente o probe OCR/FPS do caminho de retorno. A retomada agora é idempotente e depende de três condições de contexto:

1. A sessão MediaProjection precisa continuar autorizada e possuir VirtualDisplay, ImageReader e handler ativos.
2. Não pode existir superfície transitória do sistema nem a Activity principal do NVU em primeiro plano.
3. O refresh imediato de UsageStats precisa confirmar o pacote exato do GTO, `com.stargamesapps.gto`. Pacote vazio, NVU, orientação, FPS e OCR não são usados como prova.

Quando o pacote GTO é confirmado, o serviço marca o retorno, preserva a viagem, invalida o contexto visual anterior e rearma a barreira de estabilidade. A detecção decisória só é liberada pelos frames atuais e estáveis; o rearmamento não aceita frete, não confirma dados e não altera a viagem sozinho.

O refresh é limitado a 100 ms para evitar oscilação e chamadas excessivas. Enquanto o pacote ainda não foi confirmado, a captura continua sendo consumida, mas as mutações da máquina de estados permanecem bloqueadas.

## Evidências automatizadas

Passaram as regressões HF84, HF83/HF84, HF74, HF82, HF81, HF80, HF79, HF78, HF77, HF70, HF69, HF72, HF71 e HF66. A regressão HF84 confirma que o OCR/FPS antigo não existe mais, que o pacote GTO é exigido e que a barreira de estabilidade permanece ativa.

Também passaram:

```text
:app:compileDebugJavaWithJavac — BUILD SUCCESSFUL
:app:assembleRelease — BUILD SUCCESSFUL
```

Identidade do APK:

```text
package: name='com.nvu.operacional' versionCode='135' versionName='1.0.135'
targetSdkVersion:'36'
```

Assinatura v2/v3 verificada.

SHA-256:

```text
df6eb333897877991d0789bbc8aaca2012b9ff016be159684acb5f60f55e78de
```

## Limitação

Não há dispositivo Android/ADB disponível para executar fisicamente o ciclo `NVU → GTO → sair → retornar → detectar` neste ambiente. Portanto, as evidências são de código, regressões, compilação, assinatura e identidade do pacote. A implementação não deve ser descrita como prova física de 100% até esse ciclo ser executado em um aparelho real.
