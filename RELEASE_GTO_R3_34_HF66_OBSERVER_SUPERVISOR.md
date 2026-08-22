# GTO R3.34 HF66 — Supervisor contínuo do observador e detector

## Objetivo

Manter o serviço de observação e o detector visual vivos enquanto Observe está habilitado, inclusive durante atrasos de `UsageStats` no retorno ao GTO, sem permitir que uma tela de outro aplicativo autorize mudanças no estado da viagem.

## Causa corrigida

O card usava `projectionActive=true` como indicação de que a captura existia, mas marcava “Recuperando leitura” sempre que a prontidão estrita ainda não estava completa. Essa prontidão também dependia de foreground, pausa, barreira de estabilidade e heartbeats recentes. Em paralelo, o polling não tinha uma barreira de rearmamento: uma exceção transitória em `UsageStats`, `WindowManager` ou rotina de recuperação podia encerrar o `Runnable`, deixando o serviço vivo, porém sem supervisor.

Além disso, quando o pacote em foreground ficava atrasado, o callback descartava frames em vários estados. Isso preservava a segurança contra falsas mutações, mas também interrompia o detector justamente no retorno do simulador.

## Alterações

O polling agora possui `try/catch/finally` e sempre agenda o próximo ciclo enquanto Observe estiver habilitado. Falhas transitórias são registradas como diagnóstico e não apagam a sessão durável.

Com projeção, VirtualDisplay, ImageReader e handler vivos, o detector leve continua consumindo frames durante um atraso de foreground, mesmo que UsageStats aponte um pacote antigo. A prova visual e os gates semânticos continuam obrigatórios para restaurar o GTO ou alterar a viagem; a ampliação não concede autoridade a um aplicativo externo.

O status nativo agora expõe `detectorActive` e `detectorHeartbeatAt`. O card distingue “Ativo · detector em execução” de “Recuperando leitura”, evitando apresentar uma recuperação falsa durante a barreira de retorno.

## Limitação da plataforma

Um token `MediaProjection` não sobrevive à morte do processo Android. Se o sistema encerrar o processo, o serviço restaura a operação e a viagem a partir do estado durável, mas precisa obter uma nova autorização do Android. Isso é uma exigência da plataforma e não pode ser removido por código sem comprometer a segurança do compartilhamento de tela.

## Validação executada

Foram aprovadas as regressões HF22, HF23, HF24, HF30, HF31, HF32, HF34, HF55, HF63 e HF66. O build Gradle foi configurado até a etapa de resolução do projeto, mas a sandbox não possui Android SDK instalado; portanto a compilação completa do APK deve ser executada no ambiente Android/CI que tenha `compileSdk 36`.
