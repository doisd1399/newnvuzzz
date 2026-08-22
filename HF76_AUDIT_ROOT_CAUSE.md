# HF76 — Auditoria de continuidade do detector após saída/retorno ao GTO

## Barreiras encontradas

1. `onImageAvailable()` consumia frames apenas quando uma das sondas de retorno (`trustedWaitingFreightProbe`, `trustedFreightReturnProbe`, `trustedResultReturnProbe` ou `keepDetectorAlive`) passava. A rota `keepDetectorAlive` dependia de recursos vivos, mas a promoção da leitura continuava limitada por bridge/UsageStats.

2. `mayProbePausedFreightReturn()` exigia exclusivamente `projectionVerifiedGtoBridgeActive`, um latch em memória. Se o serviço fosse recriado ou o latch fosse perdido, mesmo uma MediaProjection autorizada e viva não habilitava os dois frames de prova da lista de fretes.

3. `foregroundPoll` usava `validateObserverRuntimePermissions()` antes de consultar foreground. A perda/atraso de UsageStats ou overlay podia marcar GTO fora do foreground e pausar a análise, embora a captura autorizada ainda estivesse recebendo frames.

4. `resumeScreenAnalysisInSameState()` corretamente reseta a barreira para três frames, mas a etapa de consumo precisava continuar independente de uma única seção de foreground; caso contrário, o detector podia ficar recebendo frames sem executar o caminho de recuperação.

5. `MediaProjection.Callback.onStop()` é a única revogação legítima. Ele encerra o token e solicita nova autorização; isso não deve ser tratado como troca normal de aplicativo. Rebind de ImageReader/VirtualDisplay sem `onStop()` deve permanecer same-grant.

## Correção HF76 aplicada

- Criado `hasAuthorizedCaptureSession()`, que considera a sessão autorizada enquanto `projectionActive`, grant validado, MediaProjection, VirtualDisplay, ImageReader e Handler estão vivos e a geometria é paisagem.
- `mayProbePausedFreightReturn()` aceita a prova durável `projectionGrantValidated` além do latch em memória; a confirmação continua exigindo dois frames atuais de lista antes de restaurar o GTO.
- `onImageAvailable()` consome o frame de recuperação sempre que a sessão autorizada está viva, mesmo que uma ponte de foreground/UsageStats tenha sido perdida; a sonda visual continua rodando e decisões permanecem protegidas pelo gate de evidência.
- `nvuMainActivityForeground` não é restaurado como `true` de SharedPreferences após recriação; somente `MainActivity.onResume()` pode afirmar que a tela do NVU está em primeiro plano.

## Limitações

O ambiente não possui `adb` nem dispositivo/emulador. A prova física de múltiplos ciclos NVU → GTO → outro app → GTO ainda depende de execução em Android real. A correção estática mantém a captura autorizada consumindo frames e elimina a dependência de uma única seção/latch para rearmar a detecção.
