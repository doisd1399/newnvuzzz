# Etapa 29 — limpeza estrutural e prevenção de regressões de projeto

Objetivo: remover código e artefatos comprovadamente órfãos, eliminar saídas de build versionadas e criar uma auditoria automática para impedir o retorno de raiz duplicada, arquivos temporários e módulos sem caminho de execução. Nenhuma regra de negócio, consulta Firebase, ranking, histórico, layout ou Cloud Function foi alterada.

## Achados corrigidos

### 1. Arquivos temporários deixados por patches anteriores

Existiam na raiz arquivos usados apenas durante alterações pontuais e que não participavam do build ou de qualquer script oficial:

- `patch_plan.cjs`
- `patch_plan.js`
- `test_patch.cjs`
- `test_patch.js`
- `test_plan.ts`
- `bun.lock` vazio

Eles foram removidos. O projeto mantém `package-lock.json` como lockfile efetivo.

### 2. Código frontend sem caminho de execução

Foi construído um grafo de imports partindo de `src/main.tsx`. Cinco módulos estavam completamente desconectados da aplicação atual e não possuíam import, rota ou importação dinâmica ativa:

- `src/context/PerformanceContext.tsx`
- `src/services/nvuNewsBackfillService.ts`
- `src/pages/admin/Operations.tsx`
- `src/components/common/NavigationProgress.tsx`
- `src/components/common/UploadTest.tsx`

A página antiga `admin/Operations.tsx` já havia sido substituída pelo fluxo ativo `admin/fleet/OperationsTab.tsx`. O serviço `nvuNewsBackfillService.ts` também não era chamado por nenhuma tela, preservando a decisão atual de não disparar rotinas administrativas do NVU News automaticamente pelo cliente.

Os cinco módulos órfãos foram removidos. Após a limpeza, todos os arquivos TS/TSX/JS/JSX de `src`, exceto a declaração `vite-env.d.ts`, são alcançáveis a partir do entrypoint da aplicação.

### 3. Build compilado das Cloud Functions dentro do projeto

`functions/lib/` era uma saída gerada pelo TypeScript e estava sendo transportada junto com o código-fonte. Isso cria risco de uma cópia JavaScript compilada ficar diferente de `functions/src` durante auditorias ou sincronizações.

Correção:

- `functions/lib/` removido do pacote fonte;
- `functions/lib/` adicionado ao `.gitignore`;
- o comportamento de deploy foi preservado, pois `firebase.json` já executa `npm --prefix functions run build` no `predeploy` e `functions/tsconfig.json` continua gerando `lib/` quando necessário.

### 4. Versão divergente entre package.json e package-lock.json

`package.json` estava em `2.3.0`, enquanto o cabeçalho e a raiz do `package-lock.json` ainda indicavam `0.0.0`.

Os metadados do lockfile foram alinhados para `2.3.0`. As dependências e versões travadas não foram alteradas.

### 5. Configuração residual de chave Gemini no bundle web

`vite.config.ts` ainda continha a substituição de `process.env.GEMINI_API_KEY`, embora nenhum módulo do aplicativo use essa variável nem o SDK Gemini.

A injeção foi removida do Vite e a instrução obsoleta de `GEMINI_API_KEY` foi retirada de `.env.example`/README. Isso evita manter um caminho desnecessário para disponibilizar segredo ao código cliente.

As dependências diretas `@google/genai`, `dotenv` e `react-medium-image-zoom` continuam declaradas por cautela nesta etapa, porque não foi possível regenerar de forma confiável todo o lockfile no ambiente de auditoria: o proxy de pacotes retornou 404 para um pacote opcional do Tailwind. Elas estão registradas como aviso de manutenção e não entram no bundle por não serem importadas pelo aplicativo atual.

### 6. Auditoria estrutural automática

Foi criado `scripts/audit-project-structure.mjs` e o comando:

`npm run audit:structure`

A auditoria falha se detectar:

- `nvu_secure_senior_final` ou outra raiz residual conhecida;
- arquivos temporários de patch/teste removidos nesta etapa;
- `functions/lib` versionado;
- divergência de nome/versão entre `package.json` e `package-lock.json`;
- import local quebrado;
- arquivo de código órfão em `src` ou `functions/src`;
- nova injeção de `GEMINI_API_KEY` pelo Vite.

## Escopo preservado

- Ranking Global: não alterado.
- Histórico de motorista/empresa: não alterado.
- Firestore Rules e índices: não alterados.
- Consultas/leitura Firebase: não alteradas.
- Cloud Functions fonte: não alterada.
- Storage e notificações: não alterados.
- Layout, rotas ativas e navegação: não alterados.
- OCR: não alterado.

## Validação

- `npm run audit:structure`: aprovado; apenas aviso das 3 dependências diretas sem uso.
- `npm run audit:firebase-costs`: 0 críticos / 0 avisos.
- `npm run audit:legacy-notifications`: aprovado.
- Grafo de imports: 0 imports locais quebrados e 0 arquivos de execução órfãos.
- Sintaxe TypeScript/TSX: 140 arquivos analisados, 0 erros sintáticos.
- `npm ci --dry-run --offline`: concluído com status 0, confirmando coerência estrutural entre `package.json` e lockfile.
- Estrutura: uma única raiz e sem `nvu_secure_senior_final`.

Esta etapa não exige deploy de Firestore Rules, índices ou Cloud Functions.
