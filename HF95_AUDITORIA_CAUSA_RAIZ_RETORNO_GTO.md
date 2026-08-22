# HF95 — Auditoria da perda de detecção após sair e retornar ao GTO

## Evidência observada

A captura do aparelho mostra a lista de fretes completamente visível, com cinco cartões e cinco botões **Aceitar**, enquanto o NVU permanece em uma apresentação equivalente a **“Escolha seu frete / Abra a lista de fretes”**. A bolinha branca está visível e estável. Isso separa os sintomas: o overlay existe, mas a autoridade de interpretação/retorno não foi reidratada corretamente.

## Causa raiz principal confirmada

O serviço ainda mistura **continuidade do transporte** com **prova de contexto GTO**. No caminho `consumeCaptureStabilityFrame()`, o código faz conceitualmente:

```text
freshGto = rearmedFromAuthorizedReturn || hasLiveCaptureContinuity(now)
```

`hasLiveCaptureContinuity()` apenas prova que MediaProjection/ImageReader entregaram um frame recente. Ela não prova que o frame atual pertence ao GTO. Quando o usuário sai do GTO, o transporte continua recebendo frames e, portanto, essa expressão continua verdadeira. O ramo que deveria analisar os pixels atuais como possível retorno ao GTO fica impedido ou tratado como já resolvido.

Esse é um ciclo circular: o serviço exige `rawGto`/UsageStats ou prova visual fresca para chamar a retomada; a prova visual só é criada no caminho de análise de retorno; a continuidade do transporte é confundida com essa prova e impede o caminho de recuperação de construir a prova nova.

## Causas secundárias que reforçam a falha

| Região | Inconsistência | Efeito |
|---|---|---|
| `pauseScreenAnalysisOutsideGto()` | Marca a análise como pausada, invalida OCR por geração e esconde o sensor de toque | O retorno precisa reabrir tudo, embora a sessão de transporte ainda esteja viva |
| `resumeScreenAnalysisInSameState()` | Só é chamado quando `rawGto` já é verdadeiro | O método que deveria restaurar a análise depende da própria restauração já ter ocorrido |
| `refreshTransientVisualContextAfterGtoReturn()` | Apaga `lastFreightListSeenAt`, opções, retângulos `realtimeAcceptRects`, histórico, painel e incrementa `freightPageGeneration` | O primeiro frame pós-retorno precisa reconstruir todos os dados sob uma barreira nova |
| `GtoCaptureStabilityGate` | É resetado sempre no retorno para três frames | A tela pode estar visível, mas o caminho de ação permanece bloqueado durante a reconstrução |
| `GtoDeterministicFlowPolicy.mayUseVisualFreightProof()` | Recusa prova visual quando UsageStats identifica outro pacote conhecido | O usuário pode estar de volta ao GTO enquanto o evento de foreground ainda aponta o app anterior |
| `refreshForegroundPackage()` | Mantém o pacote de UsageStats como autoridade até existir uma prova visual fresca | A prova visual não consegue nascer se o caminho de análise exige essa autoridade antes |
| `ensureCaptureContinuityAfterGtoReturn()` | Pode escalar para reautorização se `VirtualDisplay`/reader estiverem temporariamente incompletos | Uma lacuna de recursos locais é tratada como problema de contexto ou autorização, embora possa ser apenas uma corrida de callback |

## Sequência temporal provável

```text
1. GTO está em primeiro plano; transporte e detector funcionam.
2. Usuário sai do GTO.
3. UsageStats registra outro pacote ou um evento de background atrasado.
4. Supervisor define `gtoForeground=false` e chama `pauseScreenAnalysisOutsideGto()`.
5. Evidências de tela, retângulos e OCR são invalidadas.
6. Usuário retorna ao GTO.
7. UsageStats ainda está stale; `rawGto` permanece falso.
8. A captura pode continuar entregando frames, mas `hasLiveCaptureContinuity()` é interpretado como `freshGto`.
9. O detector não executa a transição independente `TRANSPORT_ALIVE → SCREEN_CONTEXT_RECONCILIATION`.
10. A lista permanece visível, a bolinha permanece ativa, mas o contexto acionável não é reidratado.
```

## O que precisa mudar

A correção definitiva não deve adicionar outro fallback de foreground. É necessário criar uma máquina de transporte independente, com estes contratos:

```text
CAPTURE_SESSION_ALIVE
  → FRAME_RECEIVED
  → FRAME_ANALYSIS_RUNNING
  → SCREEN_CONTEXT_RECONCILIATION
  → SCREEN_CONTEXT_CONFIRMED
  → ACTIONS_ARMED
```

O estado `CAPTURE_SESSION_ALIVE` deve depender exclusivamente de MediaProjection, VirtualDisplay, ImageReader, Handler e timestamps de frame/análise. Ele não pode ser pausado por `gtoForeground`, UsageStats, `screenAnalysisPausedOutsideGto` ou `captureStabilityGate`.

O estado de contexto deve ser separado:

```text
GTO_CONTEXT_UNKNOWN
GTO_LIST_CONFIRMED
GTO_PAUSE_CONFIRMED
GTO_ACTIVE_TRIP_CONFIRMED
GTO_RESULT_CONFIRMED
EXTERNAL_CONTEXT_CONFIRMED
```

Um frame atual estritamente compatível com uma tela GTO pode promover o contexto visual mesmo quando UsageStats ainda aponta outro pacote. Isso não deve autorizar toque por si só. Ações exigem contexto visual confirmado, geração atual, geometria válida e ausência comprovada do NVU em primeiro plano.

## Correção que não deve ser repetida

Não se deve apenas aumentar timeouts, manter a bolinha branca, remover a barreira de três frames ou chamar `resumeScreenAnalysisInSameState()` mais vezes. Essas ações mascaram ou repetem a mesma corrida. Também não se deve apagar todas as evidências ao sair e esperar uma reconstrução completa enquanto o código ainda usa foreground como pré-condição para iniciar essa reconstrução.

## Limitação da auditoria

O ambiente não possui dispositivo Android/ADB. A causa raiz foi confirmada pela sequência de dependências no código e pela evidência visual fornecida, mas a confirmação física do ramo executado no OEM exige diagnóstico no aparelho com, no mínimo, `captureMachineState`, `captureSnapshotGeneration`, `lastProjectionFrameAt`, `lastProjectionAnalyzedFrameAt`, `gtoForeground`, `foregroundPackage`, `screenAnalysisPausedOutsideGto`, `visualContextState`, `visualContextGeneration`, `lastActionBlockedReason` e `projectionStatus`.
