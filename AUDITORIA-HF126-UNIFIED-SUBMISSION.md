# Auditoria HF126 — submissão unificada de viagens GTO

## Resultado executivo

A arquitetura de envio foi simplificada para um único coordenador nativo: `GtoTripSubmissionCoordinator`. A detecção da conclusão, a proteção local e o transporte Firebase continuam separados internamente, mas somente o coordenador inicia uma submissão concluída ou um retry a partir do Android. O usuário não precisa acompanhar a fila nem interagir com etapas de autenticação.

O caminho normal agora é: detectar a tela `Concluído`, selar o snapshot imutável da sessão, iniciar o envio imediatamente e aguardar o ACK real. A caixa de saída durável permanece apenas como fallback invisível para autenticação, rede, timeout ou falha local. Ela não é um segundo fluxo de envio e não bloqueia a criação da próxima sessão.

## Causa estrutural tratada

A fonte possuía vários pontos que podiam chamar diretamente o transporte: finalização automática, recuperação após reinício, watchdog de selamento, preparação de uma nova viagem, logout, `MainActivity` e recuperação de autenticação. Além disso, o listener de envio derivava mensagens diferentes para rede, autenticação e sincronização. Essa multiplicidade permitia chamadas reentrantes e estados visuais concorrentes, especialmente quando o Firebase Auth ainda estava sendo restaurado.

O HF126 mantém `GtoAutoTripSync` como camada de outbox/transport, mas remove seu uso direto pelos chamadores externos. Os pontos externos passam por `GtoTripSubmissionCoordinator`, que serializa por `sessionId` e encaminha apenas um callback final para a UI. Uma segunda tentativa da mesma sessão não cria uma segunda chamada concorrente.

## Estados unificados

| Estado | Significado | Mensagem ao usuário |
|---|---|---|
| `READY` | Sessão nova, sem conclusão a enviar | Nenhuma mensagem de envio |
| `SENDING` | Snapshot selado e chamada de registro em andamento | “Enviando viagem automaticamente.” |
| `SYNCED` | ACK real recebido para a mesma `sessionId` e `tripId` | “Viagem registrada com sucesso.” |
| `PENDING_RETRY` | Falha temporária, autenticação indisponível ou persistência pendente | “Envio pendente; nova tentativa automática.” |

Detalhes como `NO_NATIVE_AUTH`, `TIMEOUT` e erro de rede permanecem em campos diagnósticos nativos, mas não substituem a mensagem operacional nem deixam o usuário preso em “Aguardando autenticação...”.

## Alterações aplicadas

| Área | Alteração |
|---|---|
| Android nativo | Novo `GtoTripSubmissionCoordinator` com lock por `sessionId`, estados únicos e callback coordenado. |
| Finalização | `confirmNormalResultAutomatically()` sela e envia pelo coordenador; deixou de anunciar uma segunda fase “Registrando viagem…”. |
| Recuperação | Watchdog, reinício do serviço, logout e `MainActivity` usam o mesmo coordenador. |
| Próxima viagem | `beginTrip()` redefine a sessão para `READY`, sem herdar o status da viagem anterior. |
| ACK | O listener existente continua exigindo ACK real antes da limpeza da fila e da promoção automática da próxima viagem. |
| Web/Bridge | `tripSubmissionState` e `tripSubmissionStateAt` foram expostos ao plugin e ao tipo TypeScript. |
| UI | O painel Web exibe uma única mensagem de envio, sem competir com diagnóstico de autenticação ou rede. |

## Validação objetiva

| Verificação | Resultado |
|---|---:|
| HF126 unified-submission regression | **20/20 aprovado** |
| HF125 single-bubble regression | **34/34 aprovado** |
| HF124 consecutive-trip stages regression | **30/30 aprovado** |
| HF123 consecutive-selection regression | **16/16 aprovado** |
| Build Web/Vite e sincronização Capacitor | **Aprovado** |
| Build Android Release | **BUILD SUCCESSFUL** |
| APK alinhado | `zipalign` aprovado |
| Assinatura APK | v2/v3 válidas |
| Pacote | `com.nvu.operacional` |
| Versão | `1.0.176` / `versionCode 176` |

## Artefato

`NVU-R3.34-PC-HF126-release-signed.apk`

SHA-256:

`b8a99f122cd50c55e3bb1cc5c1b5401a62ef8b37b7a5282099a71dc86e5464f8`

## Teste de campo

O teste deve concluir viagens consecutivas em aparelhos com autenticação já aquecida e também após reiniciar o aplicativo, alternar entre GTO e WhatsApp e testar uma condição de rede/autenticação atrasada. No caminho normal, deve aparecer apenas “Enviando viagem automaticamente.” e depois “Viagem registrada com sucesso.” Em uma falha real, deve aparecer “Envio pendente; nova tentativa automática.” sem perder a viagem nem impedir a próxima sessão.

A validação automatizada não substitui o teste no OEM do motorista. Ela comprova que a fonte possui um único dono de submissão, que a mesma sessão não abre chamadas concorrentes e que o ACK continua sendo a fronteira de confirmação antes da limpeza local.

## Referências internas

[1]: `android/app/src/main/java/com/nvu/operacional/GtoTripSubmissionCoordinator.java`
[2]: `android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java`
[3]: `android/app/src/main/java/com/nvu/operacional/GtoObserverService.java`
[4]: `scripts/test-gto-hf126-unified-submission.mjs`
[5]: `src/components/GtoObserverSetup.tsx`
