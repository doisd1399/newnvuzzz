# Etapa 19 — remoção dos adaptadores residuais do AppContext

## Objetivo

Finalizar a separação já iniciada para empresas, recrutamento e notificações, removendo o contexto monolítico de compatibilidade sem alterar consultas, listeners, navegação ou comportamento visual.

## Implementação

- removido o `AppContextCompatibilityProvider` que reunia novamente todos os estados em um único valor;
- removidos `AppContextType`, `appContextBaseValue` e `useAppStore`;
- as migrações internas de contratos em `src/App.tsx` passaram a consumir somente `useOperationalStore()`;
- o contrato `CompanyStoreType` passou a ser declarado diretamente em `CompanyContext.tsx`, sem depender de `Pick<AppContextType, ...>`;
- `NotificationCenter` passou a importar `AppNotification` diretamente de `NotificationsContext`;
- removidas as reexportações temporárias de notificações pelo arquivo `AppContext.tsx`;
- mantidos apenas os contextos segmentados de sessão, atividade, filtros do ranking e operações.

## Segurança contra regressões

- o encadeamento dos providers foi preservado;
- nenhum listener do Firestore foi criado, removido ou alterado;
- nenhuma consulta, limite, paginação ou cache foi modificado;
- empresas e recrutamento continuam sob `CompanyContext`;
- notificações continuam sob `NotificationsContext`;
- contratos, trabalhos, veículos e reboques continuam sob `OperationalContext`;
- sessão, troca de perfil, logout e proteção de rotas continuam sob `SessionContext`;
- nenhum arquivo de regras, índices ou Cloud Functions foi alterado.

## Arquivos modificados

- `src/context/AppContext.tsx`
- `src/context/CompanyContext.tsx`
- `src/App.tsx`
- `src/components/NotificationCenter.tsx`
- `scripts/audit-firebase-costs.mjs`

## Validação

- auditoria estática de custos e regressões: 0 críticos e 0 avisos;
- 120 arquivos TypeScript/TSX transpilados individualmente sem erros de sintaxe;
- nenhuma referência a `useAppStore`, `AppContextCompatibilityProvider`, `AppContextType` ou `appContextBaseValue` permaneceu no código-fonte;
- arquivos JSON validados;
- esta etapa não exige deploy do Firebase.

O build completo continua dependente da instalação das dependências do projeto no ambiente de desenvolvimento.
