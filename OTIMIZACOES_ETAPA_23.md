# Etapa 23 — caminho crítico de perfis e operação ativa

Objetivo: reduzir o intervalo entre abrir os perfis e visualizar os dados reais, sem restaurar listeners globais ou consultas sem filtro.

## Alterações

- Viagens canônicas não aguardam mais todas as consultas de compatibilidade legada para a primeira exibição.
- Snapshots não vazios do cache local podem ser exibidos imediatamente e são reconciliados pelo servidor.
- Snapshots vazios do cache não são tratados como resultado final, evitando estados falsos de ausência de dados.
- A operação do motorista é identificada pelo trabalho antes de toda a coleção de contratos terminar de carregar.
- O contrato específico da operação ativa é antecipado por leitura direta e deduplicada.
- Cache operacional vazio não libera mais prematuramente a tela de solicitar trabalho.
- O progresso salvo no trabalho é exibido enquanto o histórico da operação é reconciliado.
- Perfis de empresa e motorista exibem ganhos, viagens e média com o histórico do próprio perfil antes da conclusão do ranking global.
- O catálogo completo de empresas passa a ser carregado em segundo plano nas telas de perfil.

## Preservado

- consultas filtradas do Firestore;
- compatibilidade com documentos legados;
- ranking e cálculos finais;
- notificações;
- regras, índices e Cloud Functions;
- layout e navegação.

## Validação estática

- auditoria de custos: 0 críticos e 0 avisos;
- auditoria de notificações legadas: aprovada;
- arquivos alterados transpilados isoladamente sem erros de sintaxe;
- build completo indisponível no ambiente por ausência de `zwitch@2.0.4` no registro interno.
