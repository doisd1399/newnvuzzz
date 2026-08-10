# Etapa 27 — consistência do histórico de empresa e motorista

Objetivo: impedir que falhas transitórias em consultas de compatibilidade sejam interpretadas como histórico vazio ou conjunto completo, preservando o carregamento instantâneo já implementado.

## Correções aplicadas

- `loadIdentityTripsOnce()` continua fazendo somente consultas filtradas pelos identificadores da empresa ou do motorista, mas agora só grava o cache quando **todos** os aliases legados foram confirmados pelo servidor.
- O `Promise.allSettled` é usado apenas para aguardar o encerramento de todas as consultas. Qualquer rejeição aborta o conjunto e nenhum resultado parcial é promovido a cache válido.
- `listenCompanyTrips()` e `listenDriverTrips()` não transformam mais falha da compatibilidade legada em `legacyReady = true` com lista vazia.
- Em caso de falha, o último histórico confirmado permanece visível e o erro é encaminhado para o mecanismo de retry.
- `useDriverTrips()` recebeu retry com backoff exponencial, equivalente ao comportamento já existente no histórico da empresa: 1 s, 2 s, 4 s... até o máximo de 30 s.
- O retry do motorista é cancelado corretamente no logout e após a liberação do cache da tela.
- Os cartões de empresas vinculadas ao usuário passam a usar `getDocFromServer()` para documentos ainda não hidratados, evitando que uma resposta local antiga seja confundida com confirmação atual.
- Se uma dessas leituras pontuais falhar, os cartões já confirmados permanecem disponíveis e uma nova tentativa é agendada. Nenhuma leitura global de `frotas` é criada por esse fluxo.

## Escopo preservado

- Ranking Global e seus cálculos/filtros não foram alterados.
- Não foi restaurada nenhuma leitura global de `historico_viagens`.
- As consultas de histórico continuam limitadas por `companyId`/aliases ou `driverId`/aliases.
- O cache visual instantâneo de perfis e históricos foi preservado.
- Firestore Rules, índices, Cloud Functions, Storage e notificações não foram alterados.
- Nenhuma mudança de layout ou navegação foi realizada.

## Arquivos alterados

- `src/repositories/TripsRepository.ts`
- `src/hooks/useDriverTrips.ts`
- `src/context/CompanyContext.tsx`

## Validação

- 136 arquivos TypeScript/TSX analisados sintaticamente: 0 erros.
- Invariantes específicas da Etapa 27: aprovadas.
- Auditoria de custos Firebase: 0 críticos e 0 avisos.
- Auditoria de notificações legadas: aprovada.
- Arquivos JSON: válidos.

Esta etapa altera somente o frontend e não exige deploy de regras, índices ou Cloud Functions.
