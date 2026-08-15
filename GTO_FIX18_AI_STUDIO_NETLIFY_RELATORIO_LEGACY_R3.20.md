# NVU GTO FIX18 — Google AI Studio + Netlify

Base recebida: `nvu-zzz (76) (4).zip`.

## Resultado

Este ambiente precisava receber parte do FIX18. A arquitetura modular atual foi preservada; não foi substituída pelo backend monolítico do projeto Capacitor.

Correções aplicadas:
- `functions/src/gtoTrips.ts`: contrato FIX18, região `us-central1`, validação de `contractVersion`, sessão, timestamp, faixas de km/valores, fingerprint SHA-256 e proteção contra colisão/idempotência divergente;
- ACK do backend com `success`, `contractVersion: 18`, `sessionId`, `tripId` e `payloadFingerprint`;
- validação de alteração de veículo/reboque entre início e conclusão;
- `src/lib/gtoObserver.ts`: campos de integridade/sincronização e compatibilidade de toque preciso;
- `src/components/GtoObserverSetup.tsx`: status de sincronização/integridade e texto atualizado do registro automático;
- `scripts/validate-gto-auto-web.mjs`: validação automática do contrato FIX18;
- `package.json`: alias `validate:gto-fix18` e `setup:functions`.

Validação: 30/30 verificações GTO aprovadas. Os arquivos TypeScript modificados e todos os módulos de `functions/src` passaram na transpilação sintática.

O arquivo `netlify.toml` e a estrutura específica do ambiente Google AI Studio/Netlify foram preservados.
