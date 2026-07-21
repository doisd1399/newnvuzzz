# Correção — Total do período no perfil do motorista

## Causa confirmada

O resumo do Histórico usava uma consulta agregada separada da lista. Quando essa agregação falhava (índice/permissão/tipo do campo `valor`), o código usava apenas a primeira página visual de 30 registros como total. Além disso, o perfil isolado podia consultar a empresa ativa do usuário logado em vez da empresa do motorista visualizado.

## Correções

- O resumo agora é calculado sobre o conjunto completo de viagens válidas do período selecionado.
- A paginação de 30 itens afeta apenas os cards visíveis, nunca os totais.
- `Tudo`, `Hoje`, `Esta Semana`, `Esse mês` e `Data` usam a mesma data canônica e as mesmas regras do ranking.
- Valores em número ou texto brasileiro (`14.900,00`) são normalizados antes da soma.
- O perfil isolado envia explicitamente a empresa do motorista para o Histórico.
- Registros antigos com `driverId`/`driverName` também entram no total.
- A barra de resumo permanece disponível dentro do perfil administrativo.

## Resultado esperado

Ao selecionar **Tudo**, a barra deve mostrar o total completo do motorista, mesmo que apenas 30 cards estejam inicialmente renderizados. Ao selecionar **Esse mês**, Histórico e Ranking devem apresentar a mesma quantidade e o mesmo valor para o mesmo motorista/simulador/empresa.
