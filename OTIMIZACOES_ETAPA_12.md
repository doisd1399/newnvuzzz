# Etapa 12 — checkpoints persistentes dos backfills

## Objetivo

Evitar que uma falha tardia obrigue as rotinas de servidor a repetir etapas já concluídas, preservando o fallback atual do aplicativo e sem criar dependência de deploy imediato.

## NVU News

O controle existente em `system_settings/nvu_news_individual_v4` passou a registrar checkpoints versionados:

- `pending`;
- `classifications_written`;
- `legacy_classifications_removed`;
- `communications_migrated`;
- `completed`.

O intervalo de 70 dias fica fixado no primeiro checkpoint. Se ocorrer falha depois da gravação das classificações, a próxima tentativa retoma da limpeza ou da migração, sem reler novamente o histórico de viagens.

Também são preservados contadores, intervalo processado, identificador da execução, último checkpoint, erro e horário de conclusão.

## Ranking consolidado

Os documentos em `ranking_aggregate_controls` passaram a registrar:

- versão do checkpoint e do schema;
- período e intervalo processado;
- identificador da execução;
- estágio `collecting`, `writing` ou `completed`;
- quantidade de documentos e lotes gravados;
- último agregado escrito;
- erro, falha e último checkpoint.

Falhas recentes entram em intervalo de contenção de 15 minutos. Isso impede que várias entradas na página disparem imediatamente a mesma reconstrução cara.

A Function de reconciliação recebeu limite explícito de 540 segundos e 1 GB. O lock é renovado a cada checkpoint e continua restrito aos últimos 70 dias.

## Compatibilidade

- Nenhuma tela foi alterada.
- O ranking por viagens continua sendo fallback.
- Nenhuma consulta global sem período foi adicionada.
- Nenhuma regra do Firestore foi alterada.
- Nenhum backfill é executado antes da publicação das Functions.
- Rotinas já concluídas continuam reconhecidas como concluídas.

## Arquivos alterados

- `functions/src/nvuNewsBackfill.ts`
- `functions/src/rankingAggregates.ts`
- `functions/lib/nvuNewsBackfill.js`
- `functions/lib/nvuNewsBackfill.js.map`
- `functions/lib/rankingAggregates.js`
- `functions/lib/rankingAggregates.js.map`
- `scripts/audit-firebase-costs.mjs`

## Publicação futura

Esta etapa será ativada junto com as demais alterações de servidor no deploy final.
