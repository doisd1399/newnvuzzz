# Etapa 2 — auditoria dos comprovantes legados

Esta etapa é deliberadamente **não destrutiva**.

## Objetivo

Levantar os comprovantes antigos ainda armazenados no padrão legado:

`empresas/{companyId}/receipts/{userId}/{file}`

O script considera elegível apenas um objeto cujo `timeCreated` tenha 45 dias ou mais.

## O que é medido

- quantidade total de objetos examinados sob `empresas/`;
- quantidade de comprovantes que realmente correspondem ao padrão legado;
- quantidade com 45 dias ou mais;
- quantidade ainda dentro dos 45 dias;
- espaço total ocupado pelos comprovantes legados;
- espaço que poderia ser liberado pelos objetos elegíveis;
- totais por empresa;
- lista exata dos caminhos candidatos, tamanho, data de criação e geração do objeto.

O resultado é salvo em `legacy-trip-receipts-audit.json` por padrão.

## Garantias desta etapa

- Não existe chamada `delete()` no script de auditoria.
- Não lê, altera ou exclui documentos de `historico_viagens`.
- Não modifica `comprovanteUrl`.
- Não modifica `imageHash`.
- Não altera logos, fotos ou outros objetos fora do padrão exato de `/receipts/` legado.
- Objetos com metadata de criação inválida são ignorados, nunca assumidos como antigos.

## Execução

O script requer credenciais Google/Firebase válidas para leitura do bucket. O ambiente mais simples é o Google Cloud Shell, que já fornece autenticação e `gcloud`.

Execute a auditoria antes de qualquer limpeza real e revise o JSON gerado. A exclusão dos comprovantes antigos só deve ser tratada em uma etapa posterior, usando o relatório aprovado como base.
