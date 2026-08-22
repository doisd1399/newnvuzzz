# HF92 — Snapshot atômico, recuperação exclusiva e histerese do detector

## Implementação

A HF92 implementa a correção definitiva contra a oscilação observada na bolinha branca e contra condições de corrida entre o ImageReader e o supervisor.

| Componente | Implementação |
|---|---|
| Snapshot | `CaptureRuntimeSnapshot` imutável publicado por `AtomicReference<CaptureRuntimeSnapshot>` com geração, timestamps, recursos, dimensões, identidade do reader e estado de recuperação |
| Publicação | `recordCaptureFrameHeartbeat()` publica o snapshot após cada frame/análise; criação, troca, liberação e recuperação também publicam o estado atual |
| Saúde | `isCapturePipelineHealthy()` e `isDetectorSessionOperational()` leem somente o snapshot atômico, eliminando a combinação de campos cross-thread potencialmente stale |
| Recuperação | `RECOVERY_IN_FLIGHT` impede uma segunda recuperação durante o lease; a recuperação é associada à geração e à identidade do reader candidato |
| Confirmação | O lease só termina no primeiro callback do reader candidato, após validação de geração e identidade |
| Falha | Geração alterada, exceção ou liberação de recursos aborta o lease e publica estado `IDLE` |
| Histerese | O branco exige dois snapshots saudáveis; a queda exige 2.200 ms contínuos de não saúde. Atrasos curtos não produzem piscada, mas perda sustentada ainda é visível |
| Orientação | Rotas de análise contínua, sessão autorizada e probes de retorno exigem dimensões válidas, não `width > height` |
| Diagnóstico | Plugin expõe geração, reader, estado de recuperação, instante de início, streak saudável e instante de início da não saúde |

## Fluxo de recuperação HF92

```text
watchdog identifica ausência sustentada
        ↓
RECOVERY_IN_FLIGHT(generation, reason)
        ↓
cria reader candidato e troca superfície
        ↓
pública readerIdentity do candidato
        ↓
aguarda primeiro callback do candidato
        ↓
confirma geração + identidade
        ↓
RECOVERY_IDLE e heartbeat volta a ser publicado
```

Enquanto `RECOVERY_IN_FLIGHT` estiver ativo dentro do timeout, polls adicionais não iniciam outro rebind. Isso elimina a sobreposição de trocas de ImageReader que produzia lacunas e estados inconsistentes.

## Histerese do indicador

A entrada `rawHealthy` continua baseada em transporte e análise reais. A interface não troca de cor imediatamente a cada leitura. Dois heartbeats saudáveis consecutivos acendem o branco. Para apagar, a condição não saudável precisa permanecer por 2.200 ms contínuos. A histerese não transforma uma sessão parada em saudável: ela apenas evita uma transição visual causada por uma lacuna transitória.

## Validações

Passaram as regressões HF92, HF91, HF90, HF89 e HF74. A regressão temporal HF92 verifica que um atraso curto não apaga o indicador, que uma perda sustentada ainda o apaga e que duas tentativas de recovery concorrentes resultam em apenas um lease. A compilação Java debug e `assembleRelease` passaram.

O APK foi zipaligned, assinado com o keystore fornecido e verificado pelas assinaturas v2 e v3.

```text
package: com.nvu.operacional
versionCode: 143
versionName: 1.0.143
targetSdkVersion: 36
SHA-256 do APK: f92800b394323b15e3f7050ac992525b9fca849c4ea9bd23579b1af6ad45f6eb
```

## Limitação

Não há dispositivo Android/ADB disponível no ambiente. A implementação e as regressões cobrem a concorrência temporal e os contratos de recuperação, mas o ciclo físico NVU → GTO → sair → retornar ainda precisa ser conferido no aparelho. O diagnóstico deve observar `captureSnapshotGeneration`, `captureSnapshotReaderIdentity`, `captureRecoveryState`, `captureRecoveryGeneration`, `captureRecoveryStartedAt`, `captureIndicatorUnhealthySince` e `captureIndicatorHealthyFrameStreak`.
