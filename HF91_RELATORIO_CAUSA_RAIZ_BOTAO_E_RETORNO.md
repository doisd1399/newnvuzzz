# NVU R3.34 PC HF91 — Causa raiz do retorno e do botão flutuante

## Causa raiz confirmada

A HF90 separou corretamente a saúde do transporte, mas ainda faltava uma transição simétrica do contexto visual. O supervisor promovia `gtoForeground=true` ao reconhecer o GTO, porém não havia uma transição equivalente para `gtoForeground=false` quando o usuário saía normalmente do simulador. Fora de `MediaProjection.Callback.onStop()` e do encerramento completo do serviço, a flag podia permanecer verdadeira.

Esse único latch stale produzia os dois sintomas relatados:

| Sintoma | Efeito da flag stale |
|---|---|
| Alvo **Remover e parar NVU** ausente | `beginBubbleGesture()` entendia que o gesto começou dentro do GTO; `GtoBubbleDismissPolicy` e `showBubbleRemoveTarget()` recusavam o alvo enquanto `gtoForeground=true` |
| Detecção não retomava corretamente | A rotina não registrava uma saída real, não estabelecia `nonGtoForegroundSince`, não pausava/reconciliava o contexto visual e mantinha várias rotas de seleção, commit e watchdog em estado contraditório |

## Correção HF91

O supervisor agora identifica um proprietário externo confirmado pelo UsageStats ou um evento GTO_BACKGROUND mais novo. Nessa condição, ele:

1. Demove `gtoForeground` e persiste a transição.
2. Registra a origem e o instante da saída.
3. Pausa somente a interpretação sem destruir MediaProjection, VirtualDisplay, ImageReader ou o estado da viagem.
4. Mantém a bolinha e o transporte vivos.
5. Atualiza o sensor e os overlays transitórios sem remover o botão principal.
6. Permite que o retorno ao GTO execute a reconciliação normal.

O gesto também atualiza UsageStats no `ACTION_DOWN` e decide se começou fora do GTO pelo contexto atual, não apenas pelo latch anterior. O alvo e o commit do descarte usam a mesma validação de contexto, geração, ponteiro, geometria e frescor. Um gesto iniciado dentro do GTO permanece não destrutivo mesmo que o pacote mude durante o movimento.

As rotas de seleção precisa, restauração após falha, commit do frete e watchdog de confirmação deixaram de retornar somente porque `gtoForeground` estava falso; agora dependem de heartbeat, estabilidade, ausência de superfície transitória e evidência visual atual.

## Validação

Passaram as regressões HF91, HF90, HF89 e HF74. A compilação Java debug e `assembleRelease` passaram. O APK foi zipaligned, assinado e verificado com assinatura v2/v3.

```text
package: com.nvu.operacional
versionCode: 142
versionName: 1.0.142
targetSdkVersion: 36
SHA-256 do APK: 037e7c30793db9055673e9889ac28f3e44ac5c5f89923737c9ea4258efcf92e2
```

## Limitação

Não há dispositivo Android/ADB disponível no ambiente. A causa raiz foi comprovada no fluxo nativo e coberta por regressões estruturais, mas o ciclo físico NVU → GTO → sair → retornar → arrastar botão ainda precisa ser conferido no aparelho. O diagnóstico deve observar `gtoForeground`, `foregroundPackage`, `gtoBackgroundContextSource`, `gtoBackgroundContextAt`, `bubbleGestureStartedOutsideGto`, `bubbleRemoveTargetVisible` e `bubbleGestureLastCancelReason` após sair do GTO e iniciar o arraste.
