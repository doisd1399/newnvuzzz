# NVU R3.34 PC HF88 — Comparativo HF86/HF87

## Motivo da reprovação da HF87

A HF87 alterou o significado de `bubbleGestureStartedOutsideGto` para `true` em qualquer gesto, a fim de desacoplar o botão da captura. Isso removeu a regra original da HF86: o alvo **Remover e parar NVU** só aparece quando o gesto começa fora do GTO. Como o arraste usa esse campo para autorizar o alvo destrutivo, a opção deixou de aparecer no cenário esperado.

A HF87 também tratava a continuidade de captura como motivo para manter `gtoForeground=true`. Isso misturou duas responsabilidades que precisam ser separadas: a captura pode permanecer viva enquanto o NVU está em primeiro plano, mas o contexto de interface do GTO deve continuar sendo controlado pelo fluxo HF86 para que o botão, overlays e ações conservem o comportamento correto.

## Correção HF88

HF88 restaura exatamente o contrato HF86 do botão:

```java
bubbleGestureStartedOutsideGto = !gtoForeground;
```

O alvo de remoção e a validação do drop voltam a exigir `gtoForeground == false`, gesto ativo, arraste real e a mesma geração do gesto. Assim, o arraste volta a ser funcional sem permitir encerramento acidental durante o GTO.

Para a detecção após retornar ao simulador, HF88 mantém o transporte de captura ativo e remove somente o veto indevido de `nvuMainActivityForeground` no probe de **lista de fretes**. O latch NVU pode ficar stale; a prova atual da tela continua sendo estrita: sessão autorizada, VirtualDisplay/ImageReader, estado elegível, captura em paisagem, lista de fretes, botões e duas frames contínuas antes de restaurar o contexto. Nenhum FPS, UsageStats isolado ou OCR genérico é aceito como prova.

## Fluxo esperado

| Situação | Resultado esperado |
|---|---|
| NVU/GTO em uso normal | Botão flutuante funciona; arraste comum reposiciona. |
| Usuário sai do GTO | Captura permanece consumindo frames; `gtoForeground` pode ficar falso para fins de interface. |
| Usuário retorna e a lista de fretes aparece | Duas frames estritas da lista restauram o contexto, sem depender do latch NVU stale. |
| Usuário arrasta o botão fora do GTO | Alvo “Remover e parar NVU” aparece e o drop validado pela mesma geração encerra o observador. |
| MediaProjection é realmente revogada | `onStop()` encerra a sessão e solicita nova autorização. |

## Evidências

A regressão HF88 de compatibilidade HF86 passou, assim como HF87, a simulação de sessão, as regressões HF66–HF85, a compilação Java e `assembleRelease`. O APK foi zipaligned, assinado e verificado com v2/v3.

```text
package: com.nvu.operacional
versionCode: 139
versionName: 1.0.139
targetSdkVersion: 36
SHA-256: 6d1aa92ace7a1b38e54b998200e59ce67f1fc8faac5b1f209834505d7c67e0f9
```

## Limitação

Não há dispositivo Android/ADB disponível para executar fisicamente o ciclo NVU → GTO → sair → retornar. A regressão protege o contrato HF86 do botão e a política de retorno, mas a entrega não substitui a validação no aparelho real.
