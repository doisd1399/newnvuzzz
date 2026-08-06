# Etapa 9 — Paginação dos comunicados no Painel Sênior

## Objetivo

Eliminar o listener em tempo real sobre toda a coleção `nvu_comunicados` no modal administrativo, preservando criação, visualização, edição e exclusão.

## Alterações

- O modal não consulta comunicados enquanto permanece na aba de criação.
- A lista é carregada somente quando a aba **Publicados** é aberta.
- A primeira página possui no máximo 20 documentos.
- As páginas seguintes usam cursor `startAfter` por meio do botão **Carregar mais**.
- A ordenação principal usa `sortAt desc`.
- Existe fallback limitado por ID do documento se a ordenação não estiver disponível, evitando retornar à leitura completa.
- Requisições concorrentes e respostas antigas são ignoradas para evitar duplicação e dados fora de ordem.
- Após criar ou editar, somente a primeira página é recarregada.
- Após excluir, o item é removido do estado local sem uma nova leitura.
- Ao fechar o modal, cursores, resultados e requisições pendentes são descartados.

## Escopo preservado

Não foram alterados:

- rankings e filtros de simulador;
- `TripsRepository.ts`;
- regras do Firestore;
- NVU News pública;
- cálculos de ganhos ou viagens;
- Painel Sênior fora do modal de comunicados;
- notificações push.

## Auditoria

O comando `npm run audit:firebase-costs` agora reprova a reintrodução do listener completo de `nvu_comunicados` e verifica a presença da paginação administrativa.
