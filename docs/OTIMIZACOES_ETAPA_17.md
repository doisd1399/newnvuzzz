# Etapa 17 — contexto dedicado de empresa e recrutamento

## Objetivo

Reduzir o acoplamento das telas de empresa e recrutamento ao `AppContext.tsx` sem criar novas consultas, listeners duplicados ou mudanças no comportamento atual.

## Implementação

Foi criado `src/context/CompanyContext.tsx`, com uma fatia específica para:

- empresa ativa;
- empresas vinculadas ao usuário;
- catálogo público de empresas;
- membros da empresa;
- solicitações de entrada;
- candidaturas de recrutamento;
- configurações de recrutamento;
- criação, edição e exclusão de empresas;
- aprovação, recusa, promoção, rebaixamento e remoção de membros.

Nesta fase gradual, o `AppProvider` continua sendo o único proprietário das consultas e listeners já existentes. O novo contexto recebe os dados e ações prontos, evitando que a extração abra uma segunda assinatura no Firestore.

## Consumidores migrados

- `src/pages/RecruitmentApply.tsx`
- `src/pages/ApplicationStatus.tsx`
- `src/pages/driver/JoinCompany.tsx`
- `src/pages/driver/Dashboard.tsx`
- `src/pages/SelectProfile.tsx`
- `src/pages/admin/Fleet.tsx`
- `src/pages/admin/fleet/CompanyTab.tsx`
- `src/pages/admin/fleet/DriversTab.tsx`
- `src/pages/admin/fleet/RecruitmentTab.tsx`

Essas telas agora usam `useCompanyStore()` para dados e ações de empresa/recrutamento. Dados de sessão, simuladores e operações continuam nos contextos específicos já existentes.

## Compatibilidade

- `SessionContext`, `ActivityContext`, `OperationalContext` e `useAppStore` foram preservados.
- Nenhuma API pública antiga foi removida.
- O adaptador legado continua disponível para telas ainda não migradas.
- Nenhuma consulta ou listener novo foi criado no `CompanyContext`.

## Correção preventiva incluída

Foram removidas duas chamadas antigas a `setNotifications` e `setNotificationsHydrated` que ainda permaneciam no `AppContext` após a extração da Etapa 16. O `NotificationsProvider` já limpa seu próprio estado quando o usuário é removido ou a sessão é encerrada.

## Arquivos modificados

- `src/context/CompanyContext.tsx` — novo contexto dedicado.
- `src/context/AppContext.tsx` — provider da nova fatia e remoção de setters antigos de notificações.
- telas listadas na seção de consumidores migrados.
- `scripts/audit-firebase-costs.mjs` — verificações contra duplicidade de consultas e regressões de contexto.

## Itens não alterados

- consultas e listeners atuais do Firestore;
- rankings e seleção de simulador;
- histórico de viagens;
- Cloud Functions;
- regras e índices;
- notificações push;
- layout e navegação;
- coleção legada `notificacoes`.

## Validação realizada

- auditoria estática de custos e regressões: 0 críticos e 0 avisos;
- análise sintática/transpilação isolada dos arquivos TypeScript e TSX;
- confirmação de que o novo contexto não contém chamadas ao Firestore;
- confirmação de que o `AppProvider` permanece como único proprietário dos listeners durante a migração;
- confirmação de que os consumidores principais usam `useCompanyStore()`.

O build completo não foi executado porque as dependências do projeto não estão instaladas no ambiente extraído. Esta etapa não exige deploy de Functions, regras ou índices.
