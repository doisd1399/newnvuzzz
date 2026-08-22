# Etapa 14 — empresas do ranking carregadas por escopo

## Objetivo

Evitar que a página de ranking baixe o catálogo completo da coleção `frotas` quando já existe um documento consolidado para o simulador e período selecionados.

## Alterações

- O Ranking Global deixou de solicitar o catálogo completo de empresas ao abrir uma classificação semanal ou mensal consolidada.
- Os IDs de empresas são extraídos somente do documento `ranking_aggregates` correspondente ao simulador selecionado.
- Os documentos de `frotas` necessários são carregados por `documentId()` em lotes de até 30 IDs.
- As consultas são pontuais com `getDocs`; nenhum novo listener permanente de empresas foi criado.
- O resultado fica em cache por dois minutos e requisições simultâneas para o mesmo conjunto de IDs são deduplicadas.
- Nenhum lote parcial é publicado como ranking concluído.
- Se qualquer lote de empresas falhar, o app abandona a fonte parcial e ativa o fallback estável por viagens e catálogo completo.

## Fallback preservado

O carregamento completo sob demanda continua disponível exclusivamente quando necessário:

- período personalizado;
- opção “Todos os simuladores”;
- Ranking Interno;
- Cloud Function de agregação ainda não publicada;
- documento consolidado indisponível;
- falha na consulta segmentada das empresas participantes.

## Simuladores

- A pré-seleção continua baseada no simulador do perfil/empresa ativa.
- A troca manual de simulador continua independente da empresa do usuário.
- Cada agregado carrega somente as empresas referenciadas pelo simulador e período selecionados.

## Arquivos modificados

- `src/pages/RankingGlobal.tsx`
- `src/hooks/useRankingCompaniesByIds.ts`
- `scripts/audit-firebase-costs.mjs`

## Compatibilidade

- Nenhuma regra do Firestore foi alterada.
- Nenhuma Cloud Function foi alterada.
- Nenhum índice novo é necessário para consultas por `documentId()`.
- O cálculo antigo por viagens permanece disponível como fallback.
- A melhoria principal passa a ser utilizada quando os agregados da Etapa 11 estiverem publicados.
