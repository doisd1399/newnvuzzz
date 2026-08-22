# Etapa 18 — conclusão da migração de empresas e recrutamento

## Objetivo

Concluir a separação gradual dos dados de empresa, membros e recrutamento do contexto global sem duplicar consultas, alterar o fluxo de sessão ou exigir mudanças no Firebase.

## Implementação

O módulo `src/context/CompanyContext.tsx` passou a concentrar os controladores responsáveis por:

- catálogo público de empresas carregado sob demanda;
- carregamento pontual das empresas vinculadas ao usuário;
- listener em tempo real somente da empresa ativa;
- listener dos membros da empresa ativa;
- solicitações pendentes de entrada de motoristas;
- candidaturas de recrutamento da empresa ou do usuário.

Os controladores possuem proteção por geração de sessão e encerram os listeners quando usuário, perfil ou empresa mudam. O `AppProvider` consome os controladores durante a fase de compatibilidade, mas não abre uma segunda consulta para as mesmas coleções.

## Redução dos adaptadores

- `SessionContext` deixou de expor catálogo, carregamento e lista de empresas.
- `ActivityContext` passou a expor somente demandas operacionais.
- `OperationalContext` deixou de expor membros e ações de empresa/recrutamento.
- O `AppContext` legado permanece apenas como adaptador de compatibilidade para consumidores antigos que não fazem parte desta etapa.

## Consumidores migrados

Foram migrados para `useCompanyStore()` os consumidores de empresas, catálogo, membros ou recrutamento, incluindo:

- inicialização e proteção de rotas;
- layouts administrativo e motorista;
- aquecimento do ranking;
- Ranking Global;
- NVU News;
- perfis e histórico de motorista;
- contratos, operações, relatórios e atribuição de trabalho;
- Painel Sênior;
- telas de empresa e recrutamento.

Dados exclusivamente de autenticação e autorização, como usuário atual, perfil ativo e estado da sessão, continuam no `SessionContext`.

## Segurança contra regressões

- nenhuma leitura global permanente de `frotas` foi adicionada;
- somente a empresa ativa mantém listener em tempo real;
- membros e recrutamento são filtrados por empresa ou usuário;
- troca de empresa, perfil ou usuário invalida respostas da sessão anterior;
- nenhuma regra, índice, Cloud Function ou estrutura de documento foi alterada;
- rankings, cálculos, histórico de viagens, push e layout foram preservados.

## Arquivos principais modificados

- `src/context/CompanyContext.tsx`
- `src/context/AppContext.tsx`
- `src/App.tsx`
- layouts, páginas de ranking, empresa, recrutamento, motorista e administração que ainda consumiam dados de empresa por contextos genéricos
- `scripts/audit-firebase-costs.mjs`

## Validação

- auditoria estática de custos e regressões: 0 críticos e 0 avisos;
- 120 arquivos TypeScript/TSX analisados sintaticamente;
- nenhuma duplicidade de listener de empresa, membros ou recrutamento encontrada;
- nenhuma alteração de Firebase exige deploy nesta etapa.

O build completo permanece dependente da instalação das dependências do projeto no ambiente de desenvolvimento.
