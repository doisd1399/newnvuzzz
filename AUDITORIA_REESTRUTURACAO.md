# Auditoria e reestruturação do pipeline de viagens NVU/GTO

**Projeto analisado:** `NVU-R3.34-PC-HF65-TRIP-PIPELINE-FIX`  
**Objetivo:** manter a captura e o observador estáveis durante a jornada, eliminar o bloqueio causado por entregas anteriores e assegurar envio automático com recuperação idempotente em falhas de conectividade.  
**Autor:** Manus AI

## Conclusão executiva

A causa principal do “piscar” não era uma única falha de OCR. O serviço removia a janela da bolha quando o GTO deixava de ser reconhecido momentaneamente em primeiro plano. No retorno, uma nova `bubbleView` era criada e anexada. Esse ciclo de remoção e recriação alterava o ponto branco, interrompia a continuidade visual do controle e fazia a perda transitória de prontidão parecer uma queda completa da detecção.

Também havia um acoplamento indevido entre a entrega anterior e a nova sessão: `beginTrip()` recusava uma nova viagem enquanto `gtoTripSyncStatus` não estivesse em `SYNCED`. Isso contrariava o fluxo operacional esperado pelo motorista, pois uma captura concluída, porém sem rede, podia impedir `abrir lista → aceitar frete → iniciar nova viagem`.

A implementação foi reestruturada para que a bolha principal e a sessão de captura permaneçam vivas durante a troca de aplicativo. A análise semântica continua protegida por gates estritos de foreground GTO, evitando interpretar pixels de outro aplicativo ou disparar cliques indevidos, mas o `ImageReader` continua consumindo frames e a saúde do transporte não oscila apenas por uma mudança momentânea de pacote em primeiro plano.

## Causas identificadas

| Área | Comportamento encontrado | Efeito operacional |
|---|---|---|
| Bolha principal | `refreshForegroundPackage()` chamava `hideOverlays()` fora do GTO; esse método removia `bubbleView` do `WindowManager`. | A bolha era destruída e recriada no retorno, produzindo o piscar. |
| Ponto branco | `updateCaptureHealthIndicator()` usava a prontidão operacional completa, que exigia `gtoForeground`. | Uma oscilação de UsageStats podia mudar o ponto mesmo com frames reais chegando. |
| Captura | A interpretação semântica era pausada fora do GTO e rearmada no retorno. | Havia uma barreira legítima de segurança, mas ela era visualmente confundida com uma queda de captura. |
| Nova viagem | `beginTrip()` exigia ACK/sincronização anterior antes de prosseguir. | Viagens presas ou sem internet bloqueavam a viagem atual. |
| Captura final | A prova/captura podia ser limpa no reset da sessão após o selamento local. | O retry posterior podia perder o arquivo visual original. |
| Recuperação | A restauração inicial da prova terminal não distinguia uma sessão antiga de uma sessão ativa recém-criada. | Existia risco de sobrescrever a sessão atual após reinício do processo. |

## Alterações aplicadas

### Continuidade da bolha e da captura

Em `GtoObserverService.java`, a remoção completa foi separada em `removeAllOverlays()`, reservada a parada explícita, logout, gesto de remoção autorizado e destruição real do serviço. A saída normal do GTO usa `hideTransientOverlaysKeepBubble()`, que oculta menu, chip, sensor de toque e guardas temporários, mas preserva a `bubbleView` principal.

O indicador branco agora representa a saúde do transporte de captura por meio de `isCaptureTransportHealthy(now)`. Essa função exige serviço habilitado, `MediaProjection`, `VirtualDisplay`, `ImageReader`, handler ativo e frames analisados dentro dos limiares de stale já existentes. A função não usa a oscilação de `gtoForeground` como condição visual do ponto. Os gates de decisão semântica e de toque continuam exigindo contexto GTO válido; portanto, a mudança estabiliza o indicador sem autorizar ações sobre outra aplicação.

No ciclo de reinício, a recuperação da prova terminal agora verifica se existe uma sessão ativa diferente. Uma prova antiga não pode substituir uma sessão que já foi preparada para o próximo frete.

### Envio automático e retry sem bloqueio

A conclusão continua sendo enviada imediatamente pela chamada normal de registro assim que o payload validado é selado localmente. Se a rede falhar, o payload imutável e a captura final permanecem no armazenamento local para retry idempotente. Esse armazenamento é agora tratado como **outbox de recuperação independente**, não como uma barreira da máquina de estados.

A condição que bloqueava `beginTrip()` enquanto a entrega anterior não estivesse em `SYNCED` foi removida. O serviço pode selar o payload anterior, iniciar o primeiro envio e, em seguida, preparar a nova sessão. O retry de uma sessão antiga é identificado pelo próprio `sessionId` e não altera `tripState`, `gtoTripSyncStatus` ou os campos de integridade da viagem atual.

A captura final permanece retida até o ACK positivo do backend. O selamento local apenas muda a retenção para `UNTIL_SERVER_ACK`; somente `finalizeResultProofAfterServerAck(sessionId)` libera o arquivo e limpa o cofre correspondente. Isso preserva exatamente a captura correta durante falha de internet, morte do processo ou timeout, sem misturar o arquivo com a próxima viagem.

### Interface e diagnósticos

`GtoObserverPlugin` deixou de expor `gtoBackgroundQueuePending` como uma condição verdadeira de bloqueio. O status agora separa `gtoIndependentDeliveryPending` dos dados da sessão atual e neutraliza os marcadores legados de `backgroundSyncPending*`. Os novos campos de diagnóstico registram retry e ACK de entrega independente sem reapresentar o conceito de “viagem anterior bloqueando”.

## Fluxo resultante

> **Detecção:** serviço foreground ativo → `MediaProjection` vinculada → `ImageReader` consumindo frames continuamente → decisões semânticas somente quando o frame é comprovadamente do GTO.

> **Conclusão:** tela final certificada → captura e prova persistidas → payload selado → envio imediato → ACK remove fila, prova e captura.

> **Falha de rede:** payload e captura permanecem intactos → retry exponencial idempotente → sessão atual continua independente → ACK posterior libera o artefato antigo.

| Etapa | Estado da viagem atual | Entrega anterior sem rede |
|---|---|---|
| Lista aberta | `WAITING_FREIGHT` | Não interfere. |
| Frete aceito | `CONFIRMING_FREIGHT`/`TRIP_IN_PROGRESS` | Retry independente por `sessionId`. |
| Resultado certificado | `RESULT_CONFIRMED` após selamento local | Captura retida até ACK. |
| Nova viagem | Nova sessão preparada imediatamente quando houver próximo frete | Não bloqueia lista, aceite ou captura. |

## Validação executada

A compilação e os testes foram executados após as alterações finais.

| Verificação | Resultado |
|---|---:|
| `:app:compileDebugJavaWithJavac` | **PASS** |
| `:app:testDebugUnitTest` | **PASS** |
| `:app:assembleDebug` | **PASS** |
| HF30 — projeção contínua | **24/24** |
| HF31 — ciclo de vida da bolha | **16/16** |
| HF32 — reconhecimento contínuo | **18/18** |
| HF42 — prova terminal e readiness | **29/29** |
| HF47 — ciclo de vida do resultado | **13/13** |
| HF49 — resultado automático | **17/17** |
| HF55 — retorno ao resultado | **20/20** |
| HF56 — posição da bolha | **14/14** |
| HF59 — sincronização segura | **29/29** |
| HF60 — segurança terminal | **29/29** |
| HF61 — commit de conclusão | **29/29** |
| HF64 — deadlock de conclusão | **27/27** |
| HF65 — pipeline de viagens | **22/22** |

## Limitação técnica que não pode ser mascarada

A implementação garante continuidade no ciclo normal do Android, inclusive ao sair e retornar do aplicativo, ao remover a tarefa da NVU e durante falhas transitórias de rede ou de superfície de captura. Nenhum aplicativo Android consegue garantir funcionamento absoluto depois de **force-stop**, revogação manual de `SYSTEM_ALERT_WINDOW`, revogação do token de `MediaProjection`, restrição agressiva do fabricante ou encerramento do processo pelo sistema sem oportunidade de recriação. Nesses casos, o serviço preserva a sessão e a captura final quando já certificadas, solicita nova autorização quando o Android exigir e não inventa detecção nem clique para simular continuidade.

Essa limitação é deliberadamente mantida como gate de segurança. Prometer “nunca parar” contra uma revogação do próprio Android seria incorreto; o que foi garantido no código é que uma simples troca de app, atraso de UsageStats, falha de rede, timeout ou retry de entrega anterior não interrompa nem bloqueie a jornada atual.

## Artefatos entregues

O pacote reestruturado contém o código-fonte, os testes atualizados e o relatório desta auditoria. O APK debug foi gerado com sucesso e pode ser usado para validação em dispositivo autorizado, respeitando as permissões de sobreposição, acesso de uso e captura de tela do Android.


## Correção complementar após validação externa

A validação externa reportou `FAIL pulse sensor is hidden with overlays` com **48/49** verificações. A implementação já ocultava corretamente o pulse sensor, porém o validador procurava o método antigo `hideOverlays()`. Na reestruturação, esse método foi separado em `removeAllOverlays()` para paradas explícitas e `hideTransientOverlaysKeepBubble()` para trocas de aplicativo; ambos ocultam o pulse sensor, enquanto preservam a bolha principal quando a sessão continua ativa.

O validador foi atualizado para verificar os dois caminhos corretos. A execução final resultou em **49/49 checks passed**, além de **29/29 HF42**, **29/29 HF59**, **22/22 HF65**, `assembleDebug` e `testDebugUnitTest` concluídos com sucesso.


## Correção complementar do auditor R2

O check R2 `new trip waits for previous completed delivery ACK` também estava baseado no comportamento anterior e foi substituído por `new trip does not wait for previous completed delivery ACK`, verificando o envio independente e a ausência do bloqueio antigo. Na primeira repetição, o único restante foi `machine-specific android/local.properties excluded`, causado pelo arquivo local criado exclusivamente para apontar o SDK do sandbox durante o build. Esse arquivo foi removido da árvore do projeto.

Resultado final do auditor R2: **26/26 lifecycle checks passed**. O ZIP de entrega exclui `android/local.properties`, `build`, `.gradle` e `node_modules`.
