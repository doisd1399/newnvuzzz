# Auditoria HF125 — duplicação do botão flutuante NVU

## Resultado executivo

A duplicação observada nas capturas foi identificada como uma falha de rollback do overlay nativo, não como dois componentes React desenhando o botão. A implementação nativa cria a bolha “NVU” em `GtoObserverService.showBubbleIfAllowed()`; a camada Web não possui um segundo overlay equivalente sobre o GTO.

O caminho antigo executava `windowManager.addView(bubbleView, bubbleParams)` e, no mesmo bloco `try`, atualizava o indicador de saúde e persistia o estado. Se uma dessas operações posteriores lançasse uma exceção, o `catch` apenas zerava `bubbleView`, `captureHealthDotView` e `bubbleParams`. A View podia continuar anexada ao `WindowManager`. No próximo ciclo de recuperação, como a referência Java estava nula, o serviço criava uma nova View. Assim, a primeira ficava estática e órfã, enquanto a segunda era a única ainda referenciada e respondia ao arraste.

## Correção aplicada

| Ponto | Correção HF125 | Efeito |
|---|---|---|
| Criação concorrente | `showBubbleIfAllowed()` passou a ser sincronizado no serviço. | Supervisor e recuperação não atravessam simultaneamente o intervalo `null → addView()`. |
| Falha após `addView()` | O candidato é guardado em variável local e `bubbleAddedToWindowManager` registra se foi anexado. | O rollback sabe se há uma View visível que precisa ser removida. |
| Rollback | Falhas pós-anexação usam `removeViewImmediate()` antes de limpar a referência. | Não fica uma bolha estática órfã para o próximo retry. |
| Detach/rebind | Foi criado `clearBubbleReferenceAndRemove()` e os caminhos de detach, rebind e erro de arraste passaram a utilizá-lo. | A remoção é idempotente e comum a todos os caminhos de recuperação. |
| Remoção global | `removeAllOverlays()` agora compartilha a mesma sincronização e rotina de limpeza. | Parada, logout e rebind não competem com a criação da bolha. |
| Camada Web | Nenhum segundo botão nativo foi encontrado no `GtoObserverSetup`; a única implementação “NVU” do overlay é nativa. | Evita corrigir o componente errado. |

A correção não altera o ciclo de captura, a fila durável, o ACK, o detector de fretes ou a lógica de registro de viagens. Ela atua exclusivamente na integridade da bolha principal e nos caminhos de criação/remoção do overlay.

## Validação objetiva

| Verificação | Resultado |
|---|---:|
| Regressão HF125 — criação, rollback e deduplicação | **34/34 aprovado** |
| Falha pós-`addView()` seguida de retry | Candidato removido; retry deixa **1 View** |
| Tentativa concorrente de criação | Segunda criação rejeitada enquanto a primeira existe |
| 20 ciclos de recuperação | Nenhum acúmulo de overlays |
| Build Android Release | **BUILD SUCCESSFUL** |
| APK alinhado | `zipalign` aprovado |
| Assinatura | APK Signature Scheme v2/v3 válidas |
| Pacote | `com.nvu.operacional` |
| Versão | `1.0.175` / `versionCode 175` |

## Artefato entregue

O APK é `NVU-R3.34-PC-HF125-release-signed.apk`. SHA-256:

`ae3c99e790f02778ee1815e6f9ca861a3fbda41e72739893779a91cf3f12dea7`

## Teste de campo recomendado

Instale o APK sobre a versão anterior, inicie o Observador, abra e retorne ao GTO várias vezes e mova o botão em posições diferentes. Deve existir apenas uma bolha “NVU”; ela deve responder ao arraste, e nenhuma segunda instância deve aparecer após autorização, troca de aplicativo, rotação, rebind ou recuperação do WindowManager.

Se uma instalação anterior já deixou uma View órfã no WindowManager, é recomendável encerrar o serviço NVU pelo próprio aplicativo ou reiniciar o aparelho uma vez após instalar o HF125. A partir daí, os novos caminhos de criação e recuperação removem a View candidata antes de qualquer retry.

## Limites de evidência

A causa raiz foi comprovada estaticamente e reproduzida no modelo determinístico de rollback/retry. O build e a assinatura foram verificados. O teste em aparelho real ainda é necessário para observar o comportamento específico do WindowManager do OEM, mas o caminho que permitia a segunda bolha foi removido e coberto pela regressão HF125.

## Referências internas

[1]: `android/app/src/main/java/com/nvu/operacional/GtoObserverService.java`
[2]: `scripts/test-gto-hf125-single-bubble.mjs`
[3]: `src/components/GtoObserverSetup.tsx`
[4]: `android/app/src/main/AndroidManifest.xml`
