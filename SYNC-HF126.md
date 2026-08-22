# Sincronização NVU — HF126

## Fonte canônica

Esta branch foi preparada a partir da fonte local mais nova:

`NVU-R3.34-PC-HF65-TRIP-PIPELINE-FIX`

A fonte canônica contém o projeto completo: Web/React, Capacitor, Android nativo Java/Gradle, Firebase Functions, scripts e testes de regressão. A versão Android identificada nesta preparação é **1.0.176**, `versionCode 176`.

## Base remota preservada

O repositório remoto `doisd1399/newnvuzzz` estava na `main` no commit `670bb098` — HF53, de 2026-08-18. Essa base é mais antiga e originalmente contém a contraparte Web/Functions; não contém a árvore Android completa.

A sincronização foi preparada na branch:

`sync/hf126-complete-ready`

A `main` não foi sobrescrita. A branch inclui os arquivos históricos remotos que continuam compatíveis e incorpora a fonte HF126 completa, incluindo o coordenador unificado `GtoTripSubmissionCoordinator.java` e os testes HF123–HF126.

## Conteúdo incluído

- Aplicação Web React/Vite e seus contratos de integração;
- Capacitor e projeto Android nativo Java/Gradle;
- Firebase Functions em `functions/src`;
- scripts de validação e regressão;
- documentação técnica e auditorias HF123–HF126;
- configuração de build e workflow de release sem material de assinatura.

## Conteúdo deliberadamente excluído

Não fazem parte da branch nem do pacote de importação:

- `node_modules`, `dist`, `build`, `coverage` e caches Gradle;
- APK/AAB e outros artefatos gerados;
- `local.properties` e caminhos locais de máquina;
- arquivos `.jks`, `.keystore`, `android/key.properties` e qualquer senha de assinatura;
- `.env` real, credenciais de serviço e chaves privadas;
- bibliotecas compiladas de Functions.

O arquivo `android/app/google-services.json` presente na fonte é somente a configuração usual de cliente Firebase e não contém `private_key`. Ele não substitui credenciais administrativas nem autoriza deploy de Functions.

## Estado de validação herdado

A fonte HF126 já tinha sido validada antes desta sincronização com build Web/Vite, sincronização Capacitor/Android, build Android Release e regressões do fluxo de submissão unificada. A regressão HF126 foi aprovada em 20/20, além das regressões HF123 (16/16), HF124 (30/30) e HF125 (34/34).

O lint TypeScript ainda possui erros preexistentes em arquivos não alterados; o build Vite passa. A auditoria de OCR e a decisão opcional de layout compacto em Android paisagem permanecem separadas desta sincronização e devem ser concluídas antes de gerar outro APK de teste para esses problemas.

## Publicação segura

A publicação deve ocorrer primeiro nesta branch de sincronização. Depois da revisão no GitHub/AI Studio, a branch pode ser comparada e mesclada manualmente na `main`. Nenhuma credencial de assinatura deve ser enviada ao GitHub ou ao AI Studio.
