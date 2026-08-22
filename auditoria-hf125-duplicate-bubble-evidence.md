# Auditoria HF125 — duplicação da bolha NVU

## Sintoma

As capturas mostram duas bolhas nativas “NVU” no GTO. Uma responde ao arraste e outra permanece estática. Não há duas implementações Web concorrentes do botão em tela GTO: o React apenas renderiza o cabeçalho da aplicação NVU, enquanto a bolha nativa é criada em `GtoObserverService.showBubbleIfAllowed()`.

## Causa raiz comprovada no código

`showBubbleIfAllowed()` executava `windowManager.addView(bubbleView, bubbleParams)` e, ainda dentro do mesmo `try`, chamava `updateCaptureHealthIndicator()` e persistia os marcadores de sucesso. Se qualquer operação posterior ao `addView()` lançasse uma exceção, o `catch` fazia:

```java
bubbleView = null;
captureHealthDotView = null;
bubbleParams = null;
recordOverlayFailure(ex);
```

O `catch` não removia a View que já havia sido anexada ao `WindowManager`. Na próxima rodada do supervisor, a referência nativa estava nula, portanto o serviço executava `showBubbleIfAllowed()` novamente. Resultado: a primeira View órfã permanecia estática e a segunda View, agora referenciada por `bubbleView`, era a única que respondia ao arraste.

Há uma segunda fragilidade relacionada: os caminhos defensivos de detach zeravam a referência quando `isAttachedToWindow()` retornava falso, sem tentar remover explicitamente o token antigo. Em alguns OEMs, a referência Java pode ficar stale enquanto a superfície ainda é exibida.

## Correção HF125

A criação passa a ser transacional: a View candidata é mantida em variável local; o campo `bubbleView` só é publicado depois de `addView()` e da atualização inicial do indicador. Em qualquer falha, o caminho de rollback remove a View candidata do WindowManager antes de limpar referências. Também foi criada uma rotina de remoção idempotente para não deixar View antiga quando o serviço detecta detach e vai reanexar.

Um lock de criação impede duas chamadas reentrantes do supervisor/recovery de atravessarem simultaneamente a janela `null → addView()`. A deduplicação continua limitada ao botão principal; menu, chip, sensor de toque e guardas de resultado permanecem overlays independentes e não são confundidos com a bolha.

## Validação prevista

A regressão HF125 verificará: uma única implementação de bolha; criação concorrente serializada; rollback pós-`addView()`; rebind que remove a instância anterior; e repetição de 20 ciclos sem aumentar o número de Views anexadas. O build Android e `apksigner verify` serão executados antes da entrega.
