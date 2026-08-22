# Auditoria HF124 — evidências do bloqueio pós-primeira viagem

## Sintoma de campo

Após a primeira viagem, o painel pode mostrar `Observador NVU ativo · aguardando o retorno do GTO; sessão preservada.` enquanto o motorista já está no GTO e a etapa seguinte deveria ser a escolha/seleção do frete. A lista pode ser reconhecida, mas o frete posterior não avança para confirmação.

## Evidência de código

1. `src/components/GtoObserverSetup.tsx`, bloco do painel, exibe o texto de retorno sempre que `observerLifecycleStatus === GTO_BACKGROUND_OBSERVER_ACTIVE`. Esse ramo vem antes do `driverStageMessage` e do estado atual, portanto mascara `WAITING_FREIGHT`, `CONFIRMING_FREIGHT` e demais etapas mesmo que a captura já tenha retomado.
2. `GtoObserverLifecyclePolicy.status()` deriva `GTO_BACKGROUND_OBSERVER_ACTIVE` sempre que `screenAnalysisPaused` ou `!gtoForeground`, sem consultar `tripState`, `screenState`, frescor de frames, lista certificada ou seleção em andamento. É um estado de lifecycle do serviço, não uma etapa de operação.
3. `GtoObserverService.notificationText()` e `currentJourneyGuide()` repetem a mesma prioridade indevida: retornam “aguardando retorno” antes de avaliar `WAITING_FREIGHT`/`CONFIRMING_FREIGHT`.
4. `commitPreciseFreight()` grava `deferredPreciseFreightCommit` quando `screenAnalysisPausedOutsideGto` ou o contexto de ação ainda não está disponível. Esse deferred pode ser criado quando o estado ainda é `WAITING_FREIGHT`.
5. `resumeScreenAnalysisInSameState()` só drena `deferredPreciseFreightCommit` dentro de `if (STATE_CONFIRMING_FREIGHT.equals(currentState))`. Se o retorno/protocolo restaurar ou deixar a sessão em `WAITING_FREIGHT`, o frete já lido permanece deferido sem um dreno correspondente.
6. `updateFreightTouchPulseSensor()` usa `keepPassiveTransportObserver(enabled, isCaptureTransportHealthy, overlayAllowed)`. Durante a reidratação, `resumeScreenAnalysisInSameState()` reseta a barreira para três frames; nesse intervalo `transportHealthy` pode ser falso e o sensor passivo é removido. A lista pode aparecer/detectar antes que o listener seja novamente anexado, fazendo o toque do segundo frete ser perdido.
7. O callback de toque exige contexto visual confirmado ou `isCurrentGtoActionContext()`. O detector de frames pode continuar ativo durante atraso de foreground, mas o sensor pode ter sido retirado pela política acima. Isso explica a divergência “lista detectada, frete não selecionado”.

## Correção a validar

- Separar texto de lifecycle/background da etapa operacional: mostrar “aguardando retorno” somente quando o GTO estiver realmente fora do primeiro plano e a etapa não tiver evidência atual de lista/seleção/conclusão; nunca suprimir `driverStageMessage` de uma operação ativa.
- Manter o sensor passivo anexado enquanto `enabled + projeção autorizada + overlay permitido`, independentemente de uma janela curta de transporte/estabilidade. O gate de mutação continua no callback; manter o listener não concede autoridade para aceitar uma tela desconhecida.
- Drenar um commit preciso deferido tanto em `WAITING_FREIGHT` quanto em `CONFIRMING_FREIGHT`, somente após retorno e com identidade humana/estado válido; se a identidade não existir, preservar a revisão, não presumir frete.
- Adicionar regressão determinística cobrindo primeira viagem ACK → retorno → barreira de captura → lista detectada → toque durante transporte ainda não saudável → confirmação/registro, além de ciclos N de viagens.

## Limite de evidência

A auditoria estática e os testes determinísticos não substituem teste no aparelho real. O APK só deve ser produzido depois de build, regressões e verificação de assinatura; o teste de campo ainda deve confirmar o comportamento em um OEM específico.
