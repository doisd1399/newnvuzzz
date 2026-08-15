# GTO — Etapa 1 / integração Web ↔ Capacitor

## Separação correta da arquitetura

Este pacote é o projeto do Google AI Studio / Netlify. Ele não contém nem substitui a camada Android nativa.

- Google AI Studio / Netlify: interface do NVU, contexto da operação e chamadas da bridge Capacitor.
- APK Capacitor: `GtoObserverPlugin`, serviço de overlay, detecção do GTO, MediaProjection e OCR local.

O APK configurado com `server.url` continua exibindo o frontend publicado no Netlify. Por isso o cartão da automação precisa existir neste projeto web.

## Alterações desta entrega

Foram adicionados:

- `src/lib/gtoObserver.ts`: contrato TypeScript da bridge nativa `GtoObserver`.
- `src/components/GtoObserverSetup.tsx`: cartão de ativação/estado da automação.
- `src/pages/driver/RecordTrip.tsx`: exibe o cartão somente quando o simulador resolvido é `GTO` e envia ao módulo nativo o contexto já conhecido da operação (motorista, empresa, trabalho, contrato, veículo e reboque).

Nenhum lançamento automático no Firestore foi ativado nesta etapa.
O lançamento manual existente permanece intacto.

## Fluxo de teste

1. Publicar este projeto pelo fluxo normal Google AI Studio → Netlify.
2. Manter instalado o APK Capacitor que já contém o Observador GTO.
3. Abrir o NVU pelo APK, entrar em uma operação de empresa GTO e acessar `Lançar Viagem`.
4. O cartão `Automação GTO · Etapa 1` deve aparecer entre os dados da operação e o formulário manual.
5. Conceder sobreposição e acesso de uso quando solicitado.
6. Ativar o botão GTO e abrir o simulador.
7. Confirmar que o botão flutuante aparece somente com o GTO em primeiro plano.

No navegador/preview comum do Google AI Studio o cartão não é mostrado, pois não existe bridge Android nativa naquele ambiente.
