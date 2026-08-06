# Etapa 8 — Auditoria integrada e proteção contra regressões

## Escopo

Esta etapa não altera layout, rankings, filtros de simulador, regras do Firebase, Painel Sênior, NVU News ou notificações. O foco é impedir que uma falha em consultas de compatibilidade legada deixe históricos e rankings totalmente vazios.

## Correções aplicadas

- `loadLegacyTripsOnce` continua bloqueando leituras globais, mas agora retorna uma lista vazia quando nenhum escopo é informado, sem provocar falha fatal.
- Consultas aos aliases antigos de empresa, motorista e data usam `Promise.allSettled`.
- Uma consulta de alias que falhar não descarta os resultados das demais consultas bem-sucedidas.
- Se toda a camada legada falhar, a fonte canônica de viagens continua sendo publicada.
- Falhas de compatibilidade não encerram o listener principal nem deixam o ranking preso em carregamento.
- Avisos detalhados de alias aparecem apenas no ambiente de desenvolvimento.

## Auditoria automatizada

Execute:

```bash
npm run audit:firebase-costs
```

A verificação reprova regressões críticas, como:

- leitura direta e sem query de `historico_viagens`;
- listener global permanente de `frotas`;
- ausência da proteção de escopo legado;
- ausência da constante usada por “Todos os simuladores”;
- ausência do índice legado de notificações.

## Pendências identificadas, sem alteração nesta etapa

- O catálogo completo de `frotas` ainda é carregado uma vez no boot porque Ranking Global e recrutamento dependem dele.
- O modal de comunicados ainda mantém um listener da coleção completa enquanto está aberto.
- Rankings ainda são calculados no cliente a partir das viagens do período; a consolidação por simulador e período permanece como etapa futura.
- O histórico completo das notificações legadas ainda é carregado uma vez por sessão para preservar compatibilidade.

Esses itens não foram modificados nesta etapa para evitar regressões funcionais.
