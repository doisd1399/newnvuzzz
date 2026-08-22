# Importação no Google AI Studio

## O que esta branch entrega

A branch `sync/hf126-complete-tree` representa a fonte completa HF126 do NVU. Ela inclui o Web/React, o runtime Capacitor, o Android nativo Java/Gradle, as Firebase Functions e os testes. A versão Android é **1.0.176** (`versionCode 176`).

## Importação recomendada

No Google AI Studio, use **Add files (+) → Import from GitHub** e selecione o repositório `doisd1399/newnvuzzz` e a branch `sync/hf126-complete-tree`. Como alternativa, baixe o ZIP da branch pelo GitHub e importe somente os arquivos-fonte.

O AI Studio é apropriado para revisar e editar principalmente a aplicação Web/React. O APK Android continua sendo gerado com o projeto `android/` usando Gradle/Android SDK em ambiente de build. As Firebase Functions continuam sendo compiladas e publicadas pelo fluxo Firebase autorizado; a importação no AI Studio não executa deploy administrativo automaticamente.

## Regras de segurança

Nunca importe ou publique keystore, senha de assinatura, `android/key.properties`, `local.properties`, `.env` real, token administrativo ou JSON de service account. Esses arquivos foram excluídos desta branch. O arquivo `android/app/google-services.json`, quando mantido, é somente configuração cliente Firebase e não contém chave privada; ainda assim, as regras de segurança do Firebase devem ser mantidas no console.

## Antes do próximo APK

1. Revisar no GitHub a diferença entre `main` HF53 e esta branch HF126.
2. Confirmar as alterações Web e os contratos de Functions.
3. Manter o material de assinatura somente no computador/CI protegido que fará o release.
4. Rodar build Web, `npx cap sync android`, build Gradle Release e os testes HF123–HF126.
5. Validar assinatura, alinhamento e hash do APK antes de distribuí-lo.

A branch foi criada para revisão segura e não altera a `main` automaticamente.
