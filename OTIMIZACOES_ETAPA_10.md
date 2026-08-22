# Etapa 10 — Catálogo de empresas sob demanda

## Objetivo

Remover a leitura completa da coleção `frotas` durante toda inicialização do aplicativo, preservando o funcionamento de perfis, rankings, recrutamento, NVU News e cartões de desempenho.

## Alterações

### `src/context/AppContext.tsx`

- Removida a leitura completa de `frotas` no boot.
- O login carrega somente os documentos das empresas presentes nos vínculos ativos do usuário.
- Mantido listener em tempo real somente para a empresa ativa.
- Criado `loadCompanyCatalog()`, com uma única requisição compartilhada por sessão, para telas que realmente precisam do catálogo completo.
- Adicionados estados `companyCatalogLoaded` e `companyCatalogAttempted` para evitar carregamentos infinitos e impedir uso de catálogo parcial como cache completo.
- O cache passou para a versão `nvu.public.companies.v5` e só é aceito quando marcado como completo.
- Leituras simultâneas do mesmo documento de empresa são deduplicadas.

### Telas com carregamento sob demanda

- `src/pages/RankingGlobal.tsx`
- `src/pages/RecruitmentApply.tsx`
- `src/pages/driver/JoinCompany.tsx`
- `src/pages/NewsFeed.tsx`
- `src/pages/admin/fleet/CompanyTab.tsx`
- `src/pages/driver/Profile.tsx`
- `src/pages/admin/DriverProfileIsolated.tsx`

O catálogo completo é solicitado apenas quando uma dessas telas coletivas ou analíticas precisa dele. O restante do aplicativo usa somente as empresas vinculadas à sessão.

## Preservado

- Ranking entre empresas, interno e global.
- Pré-seleção e troca de simulador.
- Recrutamento e busca de empresas.
- NVU News e validação de empresas excluídas.
- Troca de perfil e empresa ativa.
- Painel Sênior paginado.
- Regras do Firestore, histórico de viagens, notificações e layout.

## Validação

- Auditoria estática de custos: 0 críticos e 0 avisos.
- 116 arquivos TypeScript/TSX analisados sintaticamente sem erros.
- Nenhum listener global de `frotas` foi reintroduzido.
- Nenhuma leitura completa de `frotas` ocorre automaticamente no boot.
