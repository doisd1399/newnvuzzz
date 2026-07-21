# Auditoria completa — Viagens, Histórico e Ranking

Data: 20/07/2026  
Projeto auditado: `nvu-zzz (1).zip` / pasta `nvu26`

## Diagnóstico da inconsistência mostrada

A tela de Histórico executava uma consulta paginada com `limit(30)`. O resumo tentava usar uma agregação separada do Firestore (`count` + `sum`). Quando essa agregação falhava, o código ativava o fallback abaixo:

- quantidade = tamanho da lista carregada;
- ganhos = soma da lista carregada.

Como a primeira página tinha exatamente 30 documentos, o filtro **Tudo** mostrava **30 viagens e R$ 429.357,00**, mesmo existindo pelo menos **155 viagens no mês**, confirmadas pelo Histórico mensal e pelo Ranking.

Não há evidência de perda das 155 viagens. O defeito estava na forma como o total da tela era calculado.

## Correções críticas aplicadas

### 1. Histórico deixou de confundir página visual com total

Foi criada uma fonte canônica para o Histórico:

- todas as viagens válidas da empresa são recebidas em tempo real;
- filtros e totais são calculados sobre o conjunto completo;
- apenas a renderização continua paginada em blocos de 30;
- a quantidade exibida no resumo nunca mais depende do número de cards já renderizados.

Arquivo principal: `src/pages/driver/TripHistory.tsx`  
Nova fonte canônica: `src/lib/tripHistoryEngine.ts`

### 2. Histórico e Ranking agora usam a mesma regra de viagem válida

Antes:

- o Histórico consultava documentos brutos;
- o Ranking usava `normalizeTrip` e descartava canceladas/excluídas;
- isso podia produzir totais diferentes mesmo no mesmo período.

Agora ambos:

- contam somente viagens concluídas válidas;
- excluem `cancelado`, `cancelada`, `canceled`, `cancelled`, excluídas e `softDeleted`;
- usam o mesmo valor normalizado;
- usam a mesma data métrica.

Arquivos: `src/lib/tripNormalizer.ts`, `src/lib/performanceEngine.ts`, `src/lib/tripHistoryEngine.ts`

### 3. Data oficial unificada

O Histórico filtrava e ordenava por `createdAt`, enquanto o Ranking priorizava a data de conclusão. Uma viagem criada em um dia e concluída em outro podia entrar em períodos diferentes.

A ordem canônica passou a ser:

1. `completedAt`;
2. `dataFechamento`;
3. `date`;
4. `dataLancamento`;
5. `createdAt` apenas como compatibilidade legada.

Novas viagens passam a gravar `completedAt` explicitamente.

### 4. Valores em formato brasileiro corrigidos

O código anterior usava `parseFloat(String(valor))`. Exemplo:

- `14.900,00` podia ser interpretado como `14,90`.

Foi criada `parseTripValue`, compatível com número, moeda brasileira e decimal internacional. A mesma função passou a ser usada no Histórico, Ranking, edição e lançamento de viagem.

### 5. Compatibilidade com os três campos de empresa

O Histórico consultava somente `empresaId`. Registros legados com `companyId` ou `company_id` podiam aparecer no Ranking global, mas sumir no Histórico da empresa.

O repositório agora escuta e mescla:

- `empresaId`;
- `companyId`;
- `company_id`.

A mesclagem elimina duplicidades pelo ID do documento.

Arquivo: `src/repositories/TripsRepository.ts`

### 6. Atualização em tempo real

O Histórico usava `getDocs` pontual, enquanto o Ranking usava listener em tempo real. Após lançar, editar ou excluir uma viagem, as telas podiam divergir até uma recarga.

O Histórico passou a reutilizar `useTripHistory` com listener em tempo real.

### 7. Progresso da operação deixou de usar incremento/decremento cego

Somar `+1` ao lançar e `-1` ao excluir preservava qualquer erro anterior do campo `job.progress`.

Foi adicionada `TripsRepository.syncJobProgress(jobId)`, que:

- consulta as viagens reais da operação;
- conta somente viagens válidas;
- grava o progresso exato;
- reconcilia `pending`, `active` e `awaiting_completion` quando necessário.

### 8. Ex-motoristas permanecem disponíveis no histórico

O seletor mostrava apenas membros atuais quando a lista de membros estava carregada. Um ex-motorista com viagens históricas podia ficar invisível no filtro.

Agora o seletor une membros ativos e motoristas encontrados nas viagens válidas.

### 9. Simulador histórico preservado

Viagens novas agora gravam `simulatorId`, `simulatorName` e `simuladorNome`. O cálculo prioriza o simulador salvo na própria viagem antes do simulador atual da empresa. Assim uma alteração futura da empresa não move viagens antigas para outro ranking.

Também foi corrigida a normalização da opção “Todos os simuladores”.

### 10. Telas relacionadas alinhadas

Foram ajustadas as contagens e os ganhos em:

- Dashboard do motorista;
- Perfil do motorista;
- Perfil isolado no Painel Sênior;
- Operações da frota;
- card de desempenho da empresa;
- Relatórios semanais.

As semanas dos Relatórios passaram a usar domingo–sábado, igual ao Ranking e ao Histórico.

## Teste de regressão criado

Arquivo: `test_trip_history_ranking_alignment.ts`

Cenário automatizado:

- 155 viagens válidas no mês;
- 20 viagens válidas anteriores;
- uma viagem cancelada;
- uma viagem excluída;
- valor brasileiro `14.900,00`;
- uma viagem com `createdAt` fora do mês e `completedAt` dentro do mês;
- lista visual limitada a 30 registros.

Resultado validado:

- mês = 155 viagens;
- tudo = 175 viagens;
- primeira página visual = 30 cards;
- canceladas/excluídas não entram;
- Ranking mensal = Histórico mensal em viagens e ganhos.

## Validações executadas

- `npm ci`: concluído;
- `npm run lint`: aprovado, sem erros TypeScript;
- `npm run build`: aprovado;
- teste Histórico × Ranking: aprovado;
- teste de população histórica do ranking de motoristas: aprovado;
- teste de população histórica do ranking de empresas: aprovado;
- teste de totais canônicos do mesmo concorrente: aprovado;
- teste Interno × Global: aprovado;
- teste Perfil × página de Ranking: aprovado;
- teste de escopo corporativo: aprovado.

O build mantém apenas avisos não bloqueantes de tamanho de bundle e imports mistos, já existentes na arquitetura.

## Limitação da auditoria

A auditoria foi feita no código completo enviado e em testes automatizados. Não houve acesso autenticado ao Firestore de produção; portanto, não foi possível listar documentos reais malformados. Registros antigos sem status de conclusão ou sem qualquer data válida continuarão fora dos períodos atuais por segurança. Uma verificação dos dados de produção pode ser feita posteriormente com credenciais/autorização apropriadas.

## Checklist manual recomendado após o deploy

1. Abrir Histórico do JOELITON e selecionar **Esse mês**: deve manter 155 viagens e R$ 2.126.021,09, considerando que os dados não mudaram.
2. Selecionar **Tudo**: o total deve ser igual ou maior que 155; os cards continuam carregando em blocos de 30.
3. Abrir Ranking Global no mesmo mês: viagens e ganhos do motorista devem coincidir com o Histórico mensal.
4. Lançar uma viagem de teste: Histórico, Ranking e progresso devem subir uma unidade sem recarregar.
5. Excluir essa viagem: os três devem retornar ao valor anterior.
6. Comparar Ranking Interno e Global: os ganhos próprios do motorista devem permanecer iguais; apenas posição, universo e indicadores comparativos podem mudar.
