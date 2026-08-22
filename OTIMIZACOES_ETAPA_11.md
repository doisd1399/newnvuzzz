# Etapa 11 — Rankings consolidados por simulador e período

## Objetivo

Reduzir as leituras de `historico_viagens` na página Ranking Global sem substituir de forma arriscada o cálculo estável existente.

## Implementação

- Criada a coleção server-side `ranking_aggregates`.
- Cada documento representa um simulador e um período semanal ou mensal.
- O documento mantém totais consolidados de empresas e motoristas.
- A página prioriza o documento consolidado para:
  - Ranking entre empresas;
  - Ranking global de motoristas;
  - período semanal atual;
  - período mensal atual.
- Ranking Interno, período personalizado e “Todos os simuladores” continuam usando o cálculo anterior.
- Se a Function não estiver publicada, falhar ou demorar, o app ativa automaticamente o cálculo anterior por viagens.
- O warm-up inicial não abre mais o listener de viagens para semana/mês.

## Cloud Functions

- `ensureRankingAggregates`: cria ou reconcilia um período recente quando o documento ainda não existe ou está antigo.
- `updateRankingAggregatesOnTripWrite`: mantém documentos existentes atualizados em criação, edição, cancelamento ou exclusão de viagem.

A reconstrução:

- usa intervalo de datas limitado;
- pagina em lotes de 500;
- deduplica aliases de data legados;
- possui trava compartilhada por período;
- processa somente os últimos 70 dias;
- grava todos os simuladores encontrados no mesmo processamento.

## Regras e compatibilidade

A implementação grava os consolidados somente pelas Cloud Functions. O endurecimento do fallback geral legado das regras não foi alterado nesta etapa, conforme o roteiro atual.


Nenhum cálculo existente foi removido. O fluxo anterior permanece como fallback para evitar ranking vazio em caso de:

- Function ainda não publicada;
- regra ainda não publicada;
- documento consolidado ausente;
- erro temporário do Firebase;
- período personalizado;
- Ranking Interno;
- opção “Todos os simuladores”.

## Arquivos principais

- `src/pages/RankingGlobal.tsx`
- `src/hooks/useRankingAggregate.ts`
- `src/repositories/RankingAggregateRepository.ts`
- `src/lib/rankingAggregates.ts`
- `src/components/common/RankingStartupWarmup.tsx`
- `functions/src/rankingAggregates.ts`
- `functions/src/index.ts`
- `functions/lib/rankingAggregates.js`
- `functions/lib/index.js`
- `firestore.rules`
- `scripts/audit-firebase-costs.mjs`

## Publicação necessária

Para ativar a consolidação, publicar Functions e regras:

```bash
firebase deploy --only functions,firestore:rules --project vtc-frota-log
```

Sem esse deploy, o aplicativo continua funcionando pelo fallback anterior.
