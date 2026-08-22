# Auditoria HF124 — viagens consecutivas e retorno ao GTO

## Resultado executivo

A causa raiz foi identificada em dois níveis que se reforçavam. O painel React e as mensagens nativas davam prioridade absoluta ao estado de lifecycle `GTO_BACKGROUND_OBSERVER_ACTIVE`, exibindo “Observador NVU ativo · aguardando o retorno do GTO” mesmo quando a operação já estava em `WAITING_FREIGHT`, `CONFIRMING_FREIGHT`, `TRIP_IN_PROGRESS` ou em uma etapa de conclusão/sincronização. Isso mascarava a etapa real e tornava o diagnóstico de campo enganoso.

O bloqueio funcional estava na janela de seleção após o retorno. O listener `ACTION_OUTSIDE` era removido sempre que o transporte ainda não estava saudável. Durante a reidratação, a barreira de captura é reiniciada e pode levar alguns frames para ficar verde; entretanto, a lista já pode estar visível e ser detectada nesse intervalo. O toque do motorista podia ocorrer sem o sensor anexado, portanto a lista era reconhecida, mas o frete selecionado não era correlacionado.

Havia também um caminho de retenção: `commitPreciseFreight()` podia deixar um frete validado em `deferredPreciseFreightCommit` enquanto a leitura estava pausada, mas o retorno drenava esse objeto somente se a sessão já estivesse em `CONFIRMING_FREIGHT`. Quando o protocolo preservava `WAITING_FREIGHT`, o commit não tinha um dreno explícito.

## Correções aplicadas

| Área | Correção HF124 | Garantia preservada |
|---|---|---|
| Mensagens nativas | `notificationText()` e `currentJourneyGuide()` só usam a mensagem de retorno como diagnóstico para estados sem operação ativa. | A mensagem não mascara seleção, confirmação, viagem, conclusão ou sincronização. |
| Painel React | `GtoObserverSetup.tsx` usa `backgroundLifecycleOnly`; etapas operacionais têm prioridade sobre lifecycle. | O estado exibido corresponde à etapa atual da viagem. |
| Sensor de toque | `keepPassiveTransportObserver()` agora mantém o listener enquanto a sessão MediaProjection autorizada existe, mesmo durante recuperação temporária do transporte. | A presença do listener não autoriza ação; o callback continua exigindo contexto visual, geometria e estado válidos. |
| Janela crítica | `queueFreightTouchMarker()` encerra uma janela órfã quando não há pulso, linha pendente ou transação OCR ativa. | Uma tentativa perdida não bloqueia as viagens seguintes; uma janela ativa continua protegida contra duplo toque. |
| Commit adiado | Novo `drainDeferredPreciseFreightCommitIfReady()` é acionado no retorno e após lista certificada, para `WAITING_FREIGHT` e `CONFIRMING_FREIGHT`. | Só drena identidade já confirmada por ação humana; `TOUCH_LOCKED` ou evidência não certificada não é promovido automaticamente. |
| Sessão e ACK | Não houve remoção da fila durável nem alteração do contrato ACK. | `sessionId`, `tripId`, retry e limpeza idempotente continuam preservados. |

## Cadeia auditada

A sequência validada no modelo HF124 é: lista de fretes detectada; contexto visual certificado; sensor passivo disponível durante a estabilização; toque correlacionado a uma linha; identidade humana confirmada; dados da linha submetidos ao OCR/revisão segura; transição para viagem em andamento; tela Concluído certificada; registro automático protegido por fila; ACK real; limpeza idempotente; criação da sessão seguinte.

O teste determinístico percorre doze viagens consecutivas, cada uma com novo `sessionId`, e exige que todas as etapas sejam concluídas e registradas. Além disso, testa a mensagem de lifecycle em estados ativos, listener durante transporte temporariamente não saudável, commit adiado nos dois estados possíveis e rejeição de promoção quando a identidade ainda está apenas `TOUCH_LOCKED`.

## Evidências de validação

| Verificação | Resultado |
|---|---:|
| HF124 — etapas de viagens consecutivas | **30/30 aprovado** |
| HF123 — isolamento de seleção e retorno | **16/16 aprovado** |
| HF122 — contexto visual estável | **12/12 aprovado** |
| HF121 — retorno e reidratação | **13/13 aprovado** |
| HF120 — fluxo consecutivo e ACK | **16/16 aprovado** |
| HF119 — corrida callback tardio/ACK | **6/6 aprovado** |
| Build Vite + assets Capacitor | **Aprovado** |
| Build Android `assembleRelease` | **BUILD SUCCESSFUL** |
| Verificação APK v2/v3 | **Aprovada** |
| `zipalign -c -v 4` | **Aprovado** |
| Application ID / versão | `com.nvu.operacional` / `1.0.174` |

O `npm run lint` continua apresentando 18 erros TypeScript preexistentes em oito arquivos não alterados nesta correção. O build de produção Vite passou, e nenhum desses erros está no componente `GtoObserverSetup.tsx` modificado para o HF124.

## Artefato

O APK entregue é `NVU-R3.34-PC-HF124-release-signed.apk`, versão `1.0.174`, `versionCode 174`. A assinatura v2/v3 foi validada e o certificado é compatível com o APK HF123 anterior. SHA-256: `cc1a802e4bb6c31371a6d0bf8a9d370c2f5196f6b15fa86e01fb043b3e8b5735`.

## Limite de evidência

Os testes determinísticos e a validação do binário comprovam a integração estrutural e impedem regressões conhecidas, mas não simulam o compositor, o UsageStats e o canal `ACTION_OUTSIDE` de um aparelho físico específico. O teste de campo deve executar várias vezes: primeira viagem; tela Concluído; registro; retorno à lista; toque em frete posterior; confirmação; nova conclusão; envio e ACK. Durante esse teste, o painel deve mostrar a etapa operacional, não “aguardando retorno”, quando o estado já estiver ativo.

## Referências internas

[1]: `android/app/src/main/java/com/nvu/operacional/GtoObserverService.java`
[2]: `android/app/src/main/java/com/nvu/operacional/GtoResultActionFlowPolicy.java`
[3]: `src/components/GtoObserverSetup.tsx`
[4]: `scripts/test-gto-hf124-consecutive-trip-stages.mjs`
[5]: `scripts/test-gto-hf123-consecutive-selection-recovery.mjs`
