# Etapa 24 — exibição instantânea dos perfis e operações

Objetivo: priorizar o primeiro quadro útil nas páginas de perfil da empresa, trabalhos ativos, seletor de perfil e perfil do motorista, incluindo o histórico da operação atual, sem restaurar leituras globais.

## Alterações

- O escopo operacional da sessão passou a ser preservado por usuário, empresa e perfil no `sessionStorage` por até 10 minutos.
- Trabalhos ativos têm prioridade no cache; contratos, veículos e reboques referenciados por eles são mantidos junto do snapshot.
- O snapshot operacional é hidratado antes da pintura da rota, permitindo mostrar trabalhos ativos conhecidos enquanto o Firestore confirma os dados.
- Estados vazios restaurados não autorizam a tela de “solicitar trabalho”; a ausência de operação continua dependendo de confirmação do servidor.
- O perfil da empresa reaproveita imediatamente o histórico recente da própria empresa e reconcilia em segundo plano.
- O perfil do motorista utiliza consulta e cache por motorista, evitando carregar o histórico inteiro da empresa para localizar a operação atual.
- O histórico da operação atual recebe todas as viagens do motorista e filtra pelo trabalho/contrato ativo na própria tela.
- Históricos confirmados como vazios sobrescrevem o cache anterior, evitando reaparecimento de dados excluídos.
- Nomes, logos e simuladores das empresas vinculadas ficam em cache por usuário para que o seletor de perfil abra preenchido.
- O cache das empresas pessoais permanece separado do catálogo público completo, evitando limitar rankings ou recrutamento às empresas do usuário.
- A rota e o painel de perfil da empresa são pré-carregados quando o seletor identifica um perfil administrativo.

## Preservado

- consultas filtradas do Firestore;
- ausência de listener global de `frotas`;
- cálculos e filtros dos rankings;
- compatibilidade com viagens legadas;
- notificações e permissões;
- regras, índices e Cloud Functions;
- layout e navegação existentes.

## Arquivos modificados

- `src/context/AppContext.tsx`
- `src/context/CompanyContext.tsx`
- `src/hooks/useTripHistory.ts`
- `src/hooks/useDriverTrips.ts`
- `src/pages/SelectProfile.tsx`
- `src/pages/driver/Profile.tsx`
- `src/pages/driver/Dashboard.tsx`

## Validação

- 126 arquivos TypeScript/TSX transpilados sintaticamente sem erro;
- auditoria de custos: 0 críticos e 0 avisos;
- auditoria de notificações legadas: aprovada;
- arquivos JSON validados;
- build completo não executado porque `zwitch@2.0.4` não está disponível no registro deste ambiente.

Esta etapa altera somente o frontend. Não requer novo deploy de Functions, regras ou índices.
