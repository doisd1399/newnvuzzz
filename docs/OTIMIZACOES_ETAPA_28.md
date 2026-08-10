# Etapa 28 — auditoria residual de listeners, cache e leituras Firebase

Objetivo: reduzir leituras/retries desnecessários e impedir que falhas parciais de consultas segmentadas sejam promovidas a cache completo, sem alterar cálculos, filtros, regras ou fluxo visual já estabilizado.

## Achados corrigidos

### 1. Perfis de participantes do ranking

`useRankingUsersRealtime()` divide IDs em lotes de até 30 documentos. Antes desta etapa, se um lote falhasse e os demais respondessem, o conjunto mesclado podia ser marcado como `hasCompleteSnapshot = true` quando todas as fontes apenas tinham *terminado*, mesmo que uma delas tivesse terminado com erro.

Correção:

- um lote com erro nunca é promovido a snapshot completo;
- o último conjunto completo permanece visível quando já existe;
- na primeira carga, o conjunto parcial continua não autoritativo;
- a recuperação usa retry exponencial limitado a 30 s;
- os listeners do conjunto segmentado são reiniciados somente enquanto há consumidor ativo.

### 2. Confirmação das empresas do ranking

`useRankingCompaniesByIds()` já impedia cache parcial, porém a recuperação da primeira confirmação usava uma nova tentativa fixa a cada 1,5 s enquanto a página permanecesse aberta. Além disso, uma atualização que falhasse depois de existir cache completo podia permanecer sem nova tentativa automática.

Correção:

- retry passou a usar backoff de 1,5 s, 3 s, 6 s, 12 s, 24 s e máximo de 30 s;
- o mesmo conjunto limitado de IDs continua sendo consultado, sem abrir leitura global de `frotas`;
- o cache completo anterior permanece visível durante falhas transitórias;
- timers são cancelados no logout e na liberação da entrada.

### 3. Histórico de motorista e empresa após saída da tela

Os retries adicionados para robustez podiam permanecer programados durante a janela de retenção do cache mesmo depois de a tela ficar sem consumidores. Em uma conexão instável isso poderia gerar novas tentativas de Firestore sem benefício visual imediato.

Correção:

- `useDriverTrips()` não agenda nem executa retry sem assinantes ativos;
- `useTripHistory()` não executa retry sem listeners ativos;
- listener que falhou é marcado como encerrado imediatamente;
- ao retornar à tela, a assinatura é reaberta corretamente caso tenha sido encerrada;
- falha síncrona ao anexar o listener passa pelo mesmo mecanismo de recuperação limitado.

### 4. Backfill legado do histórico

A tela de histórico podia chamar `TripsRepository.runBackfill()` em toda nova sessão depois da primeira hidratação, mesmo quando os documentos já possuíam os campos de enriquecimento necessários. Isso provocava uma consulta server-side adicional ao histórico da empresa sem necessidade.

Correção:

- o backfill em background só é considerado quando o histórico já confirmado contém registro sem `veiculoNome` ou `contratoNumero` utilizável;
- empresas cujo histórico já está enriquecido não executam a varredura de migração;
- quando existe dado legado realmente incompleto, o comportamento anterior em idle/background é preservado.

## Pontos auditados e preservados

- O listener de `simulators` continua global porque representa um catálogo pequeno/canônico e já é suspenso nas superfícies de interação prioritária.
- O fallback do painel Sênior que lê `frotas` integralmente permanece somente como contingência quando a Callable de contagem falha; não é executado no fluxo normal.
- Os listeners operacionais continuam segmentados por empresa e/ou motorista e são desmontados pela geração/cleanup já existente.
- O Ranking Global não voltou a consultar `historico_viagens` sem período.
- Nenhuma leitura global nova de `frotas`, `users` ou `historico_viagens` foi criada.

## Arquivos de código alterados

- `src/hooks/useRankingUsersRealtime.ts`
- `src/hooks/useRankingCompaniesByIds.ts`
- `src/hooks/useDriverTrips.ts`
- `src/hooks/useTripHistory.ts`
- `src/pages/driver/TripHistory.tsx`
- `scripts/audit-firebase-costs.mjs`

## Escopo preservado

- cálculo e filtros do ranking: inalterados;
- resultado confirmado Android/Desktop: lógica de pontuação inalterada;
- Firestore Rules: inalteradas;
- índices: inalterados;
- Cloud Functions: inalteradas;
- Storage e notificações: inalterados;
- layout e navegação: inalterados.

## Validação

- TypeScript/TSX analisado sintaticamente: 143 arquivos, 0 erros sintáticos;
- auditoria Firebase: 0 críticos / 0 avisos;
- auditoria de notificações legadas: aprovada;
- arquivos JSON: válidos;
- estrutura: uma única raiz de projeto.

Esta etapa é frontend/auditoria estática e não exige deploy de Firestore Rules, índices ou Cloud Functions.
