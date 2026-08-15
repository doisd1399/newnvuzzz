# Alinhamento Google AI Studio / Netlify ↔ APK/Capacitor R3.34-PC-HF10

## Base aprovada

- APK/Capacitor estável: `NVU-CAPACITOR-ANDROID-R3.34-PC-HF10.zip`
- SHA-256 da base: `bf0b3ddeea5de4bc80fd491b60aec93821ecf220c660242f665a8667cde3ee20`
- Android: `1.0.62` / `versionCode 62`
- Web: `2.3.9`

## Alterações aplicadas ao Dev recebido

1. `src/` sincronizado integralmente com a fonte Web do HF10 aprovado.
2. `functions/src/` sincronizado com HF10, incluindo `gtoMoney.ts` e o contrato de `gtoTrips.ts` que grava a empresa detectada como `Origem`.
3. Dependências/locks raiz e Functions alinhados à base HF10.
4. `capacitor.config.ts` e `capacitor.remote.json` adicionados ao Dev para documentar e validar o runtime remoto HTTPS usado pelo APK.
5. `NVU_RELEASE_METADATA.json` atualizado e corrigido para Android `1.0.62 / code 62`.
6. Mantida a configuração Netlify de produção (`dist`, Node 22, SPA fallback e headers de cache).
7. Adicionado `npm run verify:web-hf10`, um gate específico do projeto Web que não exige a pasta Android.

## Contratos GTO agora alinhados

- início automático rearma a bolha pelo contrato `prepareFloatingButton()` antes de `openGto()`;
- o pedido de MediaProjection é responsabilidade do Android nativo após o GTO estar em primeiro plano;
- a Web reconhece estados de captura/estabilidade e não confunde Firestore atrasado com o estado vivo do dispositivo;
- cidades confiáveis para reconciliação OCR são enviadas ao observador nativo;
- origem automática é a empresa detectada no frete GTO;
- dinheiro usa o contrato compatível com `gtoMoneySchemaVersion: 2` no backend;
- resultado, recebimento e sincronização automática mantêm o mesmo contrato do HF10.

## Regra de publicação

- Mudança apenas Android nativo: novo APK, sem necessidade de Netlify/Functions.
- Mudança em `src/`: novo build/deploy Netlify.
- Mudança em `functions/src/`: build/deploy Firebase Functions.
- Este pacote altera `src/` e `functions/src/` em relação ao Dev antigo recebido; portanto, para atualizar um ambiente que ainda está naquele Dev antigo, publique **Netlify e Functions** uma vez antes de testar o APK estável contra a Web atualizada.
