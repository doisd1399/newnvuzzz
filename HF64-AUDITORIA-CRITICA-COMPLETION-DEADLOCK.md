# NVU R3.34-PC-HF64 — Auditoria crítica do deadlock de conclusão

Data: 2026-08-19
Android: 1.0.116 / versionCode 116
Base: R3.34-PC-HF63
Escopo: Android nativo. Web/Netlify e Firebase Functions permanecem inalterados.

## Sintoma auditado

O cenário reportado mostra uma entrega que já chegou à autoridade terminal da NVU, mas a interface permanece em mensagens como “Viagem concluída · enviando automaticamente” / “Viagem preservada · finalizando recebimento…”. O risco operacional é o motorista ficar preso no contexto da entrega anterior, sem liberar de forma confiável o próximo frete.

## Causas raiz encontradas

### 1. Contradição entre o terminal commit HF61 e o antigo resolver de saída/Receber

HF61 tornou a tela semântica `Concluído + valor` a prova terminal irreversível da entrega. Depois desse commit, `resultActionCanBeObserved()` passa corretamente a rejeitar novas ações de resultado para impedir que anúncios ou toques posteriores alterem a viagem.

Porém, o caminho legado acionado quando o modal de resultado desaparecia ainda agendava `latchCertifiedResultExitAndSend()`. Esse método consultava `resultActionCanBeObserved()` e retornava imediatamente quando o terminal commit já existia. Portanto, a mensagem “finalizando recebimento…” podia ser exibida enquanto o próprio resolver associado a ela não tinha mais autoridade para avançar o estado. Outros failsafes normalmente recuperavam a viagem, mas esse era um deadlock real quando combinado com qualquer segundo bloqueio de persistência/valor.

### 2. Recuperação de valor por uma única captura podia esperar para sempre por uma segunda fonte impossível

A recuperação OCR da captura preservada usa um identificador de evidência derivado de `resultSnapshotAt`. A mesma captura gera sempre a mesma fonte. O consenso antigo exige duas fontes distintas. Se as chaves voláteis do valor terminal fossem perdidas e apenas a captura sobrevivesse, reler a mesma imagem nunca poderia, por definição, produzir a segunda fonte independente necessária. O fluxo ficava em `WAITING_VALUE` apesar de a entrega já estar comprovada.

### 3. Recuperação de conclusão ainda tinha dependências redundantes do foreground

HF59/HF60 já possuíam watchdogs locais para selar a fila e finalizar uma entrega certificada. Mesmo assim, parte da recuperação periódica de `RESULT_CONFIRMED` era executada dentro do ramo em que o GTO precisava ser reconhecido como foreground. Em aparelhos com `UsageStats` atrasado, isso aumentava a janela em que a UI podia continuar mostrando a entrega anterior mesmo quando todo o trabalho restante era exclusivamente local.

## Correção HF64

### A. Autoridade terminal simples

Depois que `Concluído` foi certificado e o terminal commit da sessão existe, o desaparecimento do modal não tenta mais inferir um `Receber`. Ele chama diretamente a finalização automática. Um resolver legado que já tenha sido postado antes do commit também é convertido em caminho de progresso em vez de no-op.

Resultado: a NVU deixa de depender de uma ação que o próprio HF61 já tornou desnecessária.

### B. Valor terminal com recuperação durável determinística

A prioridade passou a ser:

1. valor real preservado no cofre certificado do resultado (`GtoResultProofStore`), quando presente e compatível;
2. valor ofertado do frete no snapshot imutável bloqueado antes de `TRIP_IN_PROGRESS`, como fallback terminal;
3. OCR da captura preservada continua existindo como recuperação adicional, mas não é mais uma barreira obrigatória.

O fallback do frete não lê `selectedValue` mutável. Ele abre apenas o snapshot da sessão, exige `freightLocked=true`, valida contexto, linha/fingerprint, distância e os demais campos do frete, e só então canonicaliza o valor ofertado.

Isso elimina o estado em que a mesma screenshot precisa magicamente se transformar em duas fontes de consenso.

### C. Self-healer terminal independente de UsageStats

A cada ciclo local, com throttle de 450 ms:

- `RESULT_DETECTED/AWAITING_BONUS` + prova certificada + terminal commit -> tenta concluir e selar imediatamente;
- `RESULT_CONFIRMED` -> tenta novamente selar a fila local e, quando possível, liberar o próximo frete.

Esse self-healer roda antes de a decisão `rawGto` baseada em foreground. Portanto, sair do simulador, receber ligação, voltar ao GTO ou sofrer atraso de `UsageStats` não pode congelar uma entrega que já está terminalmente comprovada.

## Invariantes preservadas

- `Concluído + valor` continua sendo a prova concreta da viagem.
- Nenhuma viagem é enviada para a rede antes de o payload ser selado de forma síncrona na fila local.
- A fila é idempotente por `sessionId` e pode continuar enviando em segundo plano.
- Falha de rede/autenticação não impede o próximo frete depois que a entrega anterior está selada localmente.
- Um novo ciclo exige uma lista de fretes real/certificada; `WAITING_FREIGHT` não interpreta a antiga tela de resultado como uma nova viagem.
- HF63 de recuperação da detecção ao retornar ao GTO permanece íntegro.
- Firebase Functions HF58 permanecem byte-idênticas; nenhuma chamada de rede extra foi adicionada pelo HF64.

## Comportamento esperado no cenário das imagens

1. A tela `Concluído` certifica e preserva a entrega.
2. A NVU finaliza o registro local automaticamente; `Receber` não é requisito.
3. Se o modal desaparecer, a NVU chama a finalização terminal diretamente.
4. Se o valor volátil tiver desaparecido, ele é recuperado do comprovante certificado ou, em último caso, do frete imutável já validado.
5. O payload é selado localmente antes da primeira tentativa de Firebase.
6. A UI sai do estado de conclusão para “Viagem salva ✓ · enviando em segundo plano. Próximo frete liberado.” assim que o próximo ciclo pode ser preparado.
7. Se o backend estiver lento/offline, a viagem anterior permanece em envio e o motorista pode seguir com o próximo frete sem duplicar a anterior.

## Limite técnico real

Não existe garantia matemática contra falha física/permanente de armazenamento, limpeza de dados pelo usuário/sistema ou um Android que mate o processo antes de qualquer gravação durável conseguir ocorrer. Nenhum aplicativo pode persistir dados se o próprio armazenamento não aceita gravações. Dentro das condições recuperáveis do Android — troca de app, ligação, retorno ao simulador, foreground atrasado, OCR que some depois da tela, processo reiniciado com os dados duráveis presentes, rede offline e atraso do backend — o HF64 remove os caminhos de deadlock identificados nesta auditoria.
