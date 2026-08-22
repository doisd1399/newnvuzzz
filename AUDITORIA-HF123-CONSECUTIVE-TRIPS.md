# Auditoria crítica HF123 — bloqueio após a primeira viagem GTO

**Projeto:** NVU/GTO — Android nativo Java + Capacitor/React + Firebase Functions  
**Candidato-fonte:** HF123 — `versionCode 173`, `versionName 1.0.173`  
**Data da auditoria:** 22 de agosto de 2026

## Conclusão executiva

A evidência do campo não correspondia a uma queda total do Observador. A lista de fretes chegou a ser capturada e estruturada: o dump registrou `tripState=WAITING_FREIGHT`, `screenState=FREIGHT_LIST` e `freightCount=5`. O bloqueio real estava na fronteira entre a detecção visual e a confirmação da seleção, agravado por inconsistências de sessão e pelo espelho canônico.

Foram identificadas e corrigidas três causas relacionadas. Primeiro, uma nova sessão local podia enviar `expectedState` herdado da sessão anterior para um documento remoto que ainda não existia. O backend interpretava o documento ausente como `IDLE` e rejeitava a inicialização com erro de pré-condição/HTTP 400, embora a nova sessão estivesse validamente começando em `WAITING_FREIGHT`. Segundo, a evidência de seleção (`selectionSource` e `selectionTouchSequence`) não era completamente isolada quando uma nova sessão era criada; isso permitia que a sessão seguinte carregasse evidência da sessão anterior. Terceiro, um marcador de toque incompleto podia permanecer como estado transitório durante uma saída/retorno ou continuar exposto nos marcadores persistidos depois de expirar, deixando a UI em `touch-marker` e podendo bloquear a próxima correlação imediata.

A fila durável não foi removida nem enfraquecida. O ACK real continua sendo persistido antes da remoção da fila, com `sessionId` e `tripId`; uma falha de limpeza continua sendo tratada como retry idempotente. A fila antiga do mesmo motorista explica o aviso visual de entrega anterior em sincronização, mas não é usada como bloqueio da lista atual.

> **Resultado:** a correção foi aplicada na fonte, o protocolo canônico foi publicado em `vtc-frota-log`, os testes determinísticos HF119–HF123 passaram e o APK Release HF123 foi gerado, alinhado e assinado com o mesmo certificado do HF122. A confirmação funcional final em campo ainda exige instalar o APK e repetir o ciclo no dispositivo real.

## Evidência que isolou a causa

O dump histórico mostrou simultaneamente a lista atual e o estado de espera: `tripState=WAITING_FREIGHT`, `screenState=FREIGHT_LIST`, `freightCount=5`, `projectionActive=true` e `foregroundPackage=com.stargamesapps.gto` [1]. Isso elimina a hipótese de que o detector simplesmente não tivesse recebido a tela.

O mesmo dump registrou `gtoCanonicalStatePending=true`, `gtoCanonicalStateError=NOT_FOUND` e `gtoCanonicalPendingFrom=CONFIRMING_FREIGHT` [1]. Os logs da Function mostraram chamadas autenticadas (`auth=VALID`) encerradas com HTTP 400 entre 04:50 e 04:51 UTC; o Firebase CLI não expôs o texto interno da `HttpsError` [2]. A análise do contrato revelou que a nova sessão podia ser criada localmente com um estado predecessor, enquanto o documento remoto daquela nova sessão ainda estava ausente.

A seleção também deixou sinais concretos de tentativa incompleta: `pendingSelectionSource=touch-marker`, `selectionTouchSequence=461` e `freightTouchSequence` posterior, sem transição persistida para um novo frete confirmado [1]. O caminho de toque abre `criticalWindow` no coordenador e impedia novos marcadores enquanto esse estado permanecia ativo [3]. A expiração existente era executada no processamento de frames; não havia uma invalidação explícita na fronteira de visibilidade/retorno, e a limpeza não removia todos os marcadores persistidos usados pelo painel [4].

| Sinal observado | Interpretação correta | Tratamento aplicado |
| --- | --- | --- |
| `freightCount=5` e `FREIGHT_LIST` | A captura/detecção visual funcionou | Manter o detector e corrigir a confirmação da seleção |
| `gtoCanonicalStateError=NOT_FOUND` + HTTP 400 | O espelho canônico rejeitou uma transição de bootstrap | Permitir bootstrap de sessão remota ausente apenas em `WAITING_FREIGHT`/`IDLE` |
| `pendingSelectionSource=touch-marker` | Existia ou havia existido uma correlação de toque incompleta | Limpar o estado transitório no timeout e nos limites de saída/retorno |
| `selectionSource=touch-marker+frame-lock` em sessão posterior | Evidência de seleção vazou entre sessões | Remover `selectionSource` e `selectionTouchSequence` ao limpar a sessão |
| Aviso “entrega anterior em sincronização” | Há outra entrada durável do mesmo motorista | Continuar exibindo como diagnóstico; nunca usar como gate da lista atual |

## Correções aplicadas

### 1. Bootstrap canônico correto e fail-closed para sessões existentes

Em [`functions/src/gtoState.ts`][3], o backend agora distingue explicitamente `bootstrapState`: uma sessão remota ausente pode iniciar em `WAITING_FREIGHT` ou `IDLE` sem comparar o `expectedState` herdado da sessão local anterior. Para uma sessão que já existe, a proteção compare-and-swap permanece ativa: `expectedState` divergente continua sendo rejeitado, e transições remotas inválidas continuam bloqueadas.

Essa mudança remove o HTTP 400 causado por comparar uma nova sessão com o estado sintético `IDLE` do documento inexistente. Ela não permite iniciar diretamente uma sessão ausente em `TRIP_IN_PROGRESS`, `CONFIRMING_FREIGHT` ou estado terminal.

### 2. Isolamento de evidência por sessão

Em [`GtoObserverService.java`][4], a limpeza de uma sessão remove agora `selectionSource`, `selectionTouchSequence`, `pendingSelectionSource`, `freightTouchPulseAt` e `freightTouchSequence`. Assim, uma nova sessão começa sem qualquer evidência de seleção herdada do frete anterior.

Esse isolamento é importante porque `GtoAutoTripSync.lockSelectedFreight()` usa a cadeia de evidência para validar o lock durável do frete [5]. A sessão nova só pode ser bloqueada a partir de uma seleção humana/visual pertencente à própria sessão, nunca por um marcador deixado pela sessão anterior.

### 3. Invalidação determinística do gesto incompleto

Foi adicionado `invalidateTransientFreightSelectionForVisibilityBoundary()`, chamado ao sair do GTO e ao retornar para ele quando o estado ainda é `WAITING_FREIGHT`. O método limpa somente o gesto ainda não confirmado, o coordenador e os snapshots transitórios. Ele não apaga seleção já confirmada, dados de viagem, snapshot durável, fila ou ACK.

Além disso, `clearFastTouchPulse()` agora remove os marcadores persistidos que alimentavam a UI depois que o gesto expirava. Isso elimina a divergência em que o painel continuava mostrando `touch-marker` embora o estado em memória já tivesse sido liberado.

## Preservação da entrega e da próxima viagem

A ordem durável original foi preservada. `GtoAutoTripSync` grava o ACK local com `STATUS_SYNCED`, `tripId`, progresso e estado do trabalho antes de tentar remover a entrada da fila [5]. Se a limpeza falha, a entrada é mantida para retry idempotente e a sessão atual pode ser liberada para o próximo frete. Não foi adicionado nenhum caminho que apague uma viagem sem ACK exato.

A preparação da próxima sessão continua condicionada ao ACK real e ao contador local de entregas restantes [6]. O erro do espelho canônico é diagnóstico/retry; ele não é usado por `GtoActionStateMachine` como condição de transporte ou de seleção [7].

## Validação objetiva

| Validação | Resultado |
| --- | ---: |
| HF119 — callback tardio não sobrescreve ACK | **6/6 aprovado** |
| HF120 — ACK e viagens consecutivas | **16/16 aprovado** |
| HF121 — retorno WhatsApp/GTO e reidratação | **13/13 aprovado** |
| HF122 — assinatura visual coarse estável | **12/12 aprovado** |
| HF123 — fila antiga + erro canônico + retorno + novo toque | **16/16 aprovado** |
| Compilação Java Android `:app:compileDebugJavaWithJavac` | **BUILD SUCCESSFUL** |
| Build web/React/Vite e bundle do servidor | **BUILD SUCCESSFUL** |
| Build TypeScript das Functions | **sucesso** |
| Publicação `syncGtoTripState(us-central1)` | **Successful update operation** |
| Verificação APK v2/v3 | **válida** |
| `applicationId` / versão | **com.nvu.operacional / 1.0.173 (173)** |
| Certificado comparado ao HF122 | **SHA-256 idêntico** |

O novo teste HF123 foi registrado como comando oficial `npm run test:gto-r3.34-hf123-consecutive-selection`. Ele modela a transição de uma sessão anterior para uma nova sessão, garante que o documento canônico ausente possa inicializar `WAITING_FREIGHT`, mantém a proteção para sessões existentes, preserva a fila antiga como elemento não bloqueante e garante que o retorno/timeout libere uma nova seleção.

O teste histórico `test:gto-r3.34-hf65-trip-pipeline` retornou 20/22 porque ainda exige a identidade antiga `1.0.117` em duas verificações de versão. As demais 20 verificações passaram; esse resultado é incompatibilidade do teste legado, não erro introduzido pela correção HF123. O `npm run lint` também já possui erros TypeScript preexistentes em `ErrorBoundary.tsx` e `CreateNewsModal.tsx`; o build de produção Vite passou normalmente e nenhum desses arquivos foi alterado nesta auditoria.

## Limite de garantia

Os testes determinísticos provam a correção da sequência de estados, isolamento de sessão, limpeza de gesto e contrato canônico no código. A assinatura, o alinhamento, o `applicationId` e a versão do APK também foram verificados. Esses testes não reproduzem fisicamente o compositor específico do aparelho, a latência do ImageReader ou a entrega real de `ACTION_OUTSIDE`; por isso, a auditoria não declara garantia de 100% em campo sem instalar o APK HF123 e repetir o cenário no dispositivo.

O reteste de campo recomendado é: registrar a primeira viagem e observar o ACK com `tripId`; voltar à lista; confirmar que uma lista posterior com múltiplas linhas é reconhecida e selecionável; sair para WhatsApp; retornar ao GTO; aguardar a confirmação visual da lista; selecionar outro frete; concluir a segunda viagem; e verificar dois registros distintos no sistema. O painel não deve mais reutilizar `selectionSource` antigo nem apresentar `touch-marker` persistente após uma tentativa expirada.

## Artefatos

O pacote-fonte HF123 contém as alterações, o teste regressivo e este relatório. Ele não inclui keystore, senhas, APK ou diretórios de dependências/build. O APK Release assinado é entregue separadamente para instalação e teste de campo.

## Referências internas

[1]: android/gto-state.txt "Dump histórico do estado GTO"
[2]: auditoria-hf123-evidencias.md "Evidências da consulta aos logs Firebase"
[3]: functions/src/gtoState.ts "Contrato canônico syncGtoTripState"
[4]: android/app/src/main/java/com/nvu/operacional/GtoObserverService.java "Serviço nativo do Observador"
[5]: android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java "Fila durável e ACK"
[6]: scripts/test-gto-hf120-consecutive-trip-flow.mjs "Regressão de viagens consecutivas"
[7]: android/app/src/main/java/com/nvu/operacional/GtoActionStateMachine.java "Máquina de autorização de ações"
