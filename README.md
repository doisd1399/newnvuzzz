# NVU — Google AI Studio / Netlify — R3.34-PC-HF10

Este projeto é o espelho Web/Dev compatível com a versão estável de produção do APK/Capacitor:

- Release funcional: **R3.34-PC-HF10**
- Web: **2.3.9**
- Android: **1.0.62 / versionCode 62**
- Runtime Capacitor: **Netlify remoto HTTPS**
- App ID Android: `com.nvu.operacional`

## Fonte canônica

O código de produção em `src/`, o contrato das Cloud Functions em `functions/src/`, os locks de dependências, `netlify.toml` e o contrato de runtime remoto do Capacitor foram alinhados ao pacote aprovado R3.34-PC-HF10.

O APK de produção continua responsável pela implementação Android nativa (overlay, MediaProjection, detecção visual e máquina de estados). Este Dev não inclui a pasta `android/`; ele mantém a contraparte Web/Netlify e o contrato de integração que o APK remoto consome.

## Verificação local

```bash
npm ci
npm --prefix functions ci
npm run verify:web-hf10
```

Para publicar a Web, gere `dist/` com `npm run build` e publique pelo fluxo já configurado no Netlify. As Functions só precisam ser publicadas quando houver mudança em `functions/src/` ou dependências das Functions.
