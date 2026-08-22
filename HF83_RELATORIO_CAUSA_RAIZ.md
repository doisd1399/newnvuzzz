# NVU R3.34 PC HF83 — Retorno ao GTO e refresh instantâneo da detecção

## Causa raiz

Após o usuário sair do GTO, o observador mantinha a sessão MediaProjection e continuava recebendo frames, mas `gtoForeground` permanecia falso enquanto o `UsageStats` ainda apontava para o aplicativo anterior ou para o NVU. O caminho de recuperação existente consumia o frame pelo detector OCR-free e só conseguia restaurar o foreground quando encontrava uma lista de fretes ou um modal de resultado. Em gameplay normal, sem a lista aberta, o primeiro frame era usado apenas pela barreira de estabilidade; a análise decisória continuava bloqueada.

Isso criava uma divergência entre transporte vivo e detecção funcional: a captura existia, mas o retorno não era reconhecido no momento em que o HUD do GTO reaparecia.

## Correção HF83

HF83 adiciona `GtoReturnForegroundPolicy`, uma prova OCR curta e serializada do primeiro frame real após o retorno. O probe é executado antes da barreira de estabilidade quando existe uma sessão MediaProjection autorizada e o observador está em estado pausado ou com `gtoForeground=false`.

A prova exige sinais combinados do GTO: `FPS` com velocidade `km/h`, `FPS` com âncoras de rota, ou pelo menos duas ações independentes do menu pause. Um único termo genérico não é suficiente, e orientação paisagem isolada nunca restaura o foreground.

Após a prova do HUD, o serviço registra `GTO_HUD_CONFIRMED`, atualiza `gtoForeground`, invalida o contexto visual antigo e rearma a barreira `RETURN_HUD_OCR_3_FRAMES`. A detecção decisória só volta depois de três frames atuais e estáveis. O probe não aceita frete, não confirma viagem e não altera o estado da operação sozinho.

## Evidências

Passaram as regressões HF83, HF74, HF82, HF81, HF80, HF79, HF78, HF77, HF70, HF69, HF72, HF71 e HF66. O teste unitário do gate confirmou gameplay com `FPS + km/h`, rota, menu pause e rejeição de tela externa genérica.

Também passaram:

```text
:app:compileDebugJavaWithJavac — BUILD SUCCESSFUL
:app:assembleRelease — BUILD SUCCESSFUL
```

O APK compilado e assinado internamente foi identificado como:

```text
package: name='com.nvu.operacional' versionCode='134' versionName='1.0.134'
targetSdkVersion:'36'
```

A assinatura v2/v3 foi verificada. SHA-256 interno:

```text
d59c84708d1898c80cad92b8f49429d83e18b06a32de5057897cf45182e9fcbd
```

## Limitação e decisão de entrega

Não há dispositivo Android/ADB nem execução do GTO disponíveis neste ambiente. Assim, não é possível afirmar 100% de funcionamento físico no retorno, porque a prova depende da entrega real de frames, do OCR do ML Kit e das condições do aparelho. O código e o APK foram validados estruturalmente, mas o APK release assinado fica **retido e não é entregue como versão garantida** nesta etapa, conforme a exigência de só entregar sem qualquer dúvida.
