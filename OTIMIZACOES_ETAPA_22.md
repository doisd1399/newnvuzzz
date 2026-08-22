# Etapa 22 — exibição imediata e estados operacionais confiáveis

## Objetivo

Reduzir o atraso percebido de 1 a 2 segundos ao abrir Ranking, Perfil da Empresa e Perfil do Motorista, sem restaurar leituras globais e sem exibir estados falsos durante a hidratação dos dados.

## Correções aplicadas

- Cache de sessão, separado por usuário, empresa e perfil, para trabalhos, contratos, veículos, reboques, usuários, sequências e solicitações.
- Preservação do último conjunto completo ao retornar para o mesmo escopo.
- Troca empresa → motorista reutiliza imediatamente a operação do motorista já presente no conjunto administrativo e confirma o resultado em segundo plano.
- Estados explícitos de prontidão para impedir que “Solicitar trabalho”, “Nenhuma operação” ou totais zerados apareçam antes da resposta autoritativa.
- Perfil da Empresa e Perfil do Motorista montam a estrutura analítica imediatamente e usam valores neutros enquanto catálogo e histórico são reconciliados.
- Pré-carregamento antecipado do módulo Perfil da Empresa.
- Cache em memória do documento consolidado do ranking e carregamento antecipado do agregado do simulador ativo.
- Carregamento antecipado somente das empresas presentes no agregado.
- No mobile, o ranking publica nomes e valores assim que os dados estão prontos; imagens são decodificadas em segundo plano dentro de áreas com tamanho reservado.
- Primeiro acesso sem cache usa estruturas neutras e estáveis, sem comunicar ausência real de operação ou classificação.

## Segurança funcional

- Nenhuma consulta global de `historico_viagens` foi restaurada.
- Nenhum listener global de `frotas` foi adicionado.
- Nenhuma regra, índice, Cloud Function, cálculo ou filtro de simulador foi alterado.
- Os caches são apenas de memória e são invalidados no logout.

## Validação efetuada

- Auditoria de custos: 0 críticos e 0 avisos.
- Auditoria das notificações legadas: aprovada.
- 85 arquivos TypeScript/TSX analisados sem erros de sintaxe.
- Os 12 arquivos alterados foram transpilados isoladamente sem erros.
- O build completo não pôde ser executado no ambiente porque o registro de pacotes não fornece `zwitch@2.0.4`.
