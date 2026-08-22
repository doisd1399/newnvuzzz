# Auditoria — retenção de prints de viagens por 45 dias

## Decisão adotada

- A viagem permanece integralmente em `historico_viagens`.
- `imageHash`, valores, rota, km, motorista, empresa, datas e demais campos não são removidos.
- O campo `comprovanteUrl` é mantido como string de auditoria. Depois que o objeto for apagado, essa string não consome Cloud Storage; ocupa apenas poucos bytes no documento do Firestore e evita uma segunda rotina de escrita só para limpar URLs.
- Novos comprovantes passam a ser gravados em `trip-receipts/{companyId}/{userId}/...`, isolados de logos e fotos permanentes.
- A interface não tenta carregar comprovantes com 45 dias ou mais e exibe uma mensagem de retenção.
- A exclusão física deve ser feita pelo Object Lifecycle Management do Cloud Storage, sem Cloud Function agendada.
- O bucket pode ter Soft Delete habilitado. Nesse caso, após a ação de lifecycle o objeto deixa de ficar disponível, mas pode permanecer recuperável por alguns dias conforme a configuração do bucket. Não desative Soft Delete globalmente sem auditar as demais imagens do projeto.

## Por que não apagar `comprovanteUrl` no Firestore

Apagar o campo exigiria uma segunda automação com consultas e gravações no Firestore. Manter a string é mais simples, preserva rastreabilidade e não mantém o arquivo físico. A UI foi alterada para não requisitar a URL depois do prazo.

## Configuração de lifecycle

O arquivo `ops/storage-lifecycle-trip-receipts.json` contém somente o prefixo `trip-receipts/`. Não aplique uma regra de 45 dias em `empresas/`, pois esse prefixo também contém logos e fotos que devem ser permanentes.

Antes de aplicar a configuração, verifique se o bucket já possui outras regras de lifecycle e faça merge delas. O comando `gcloud storage buckets update --lifecycle-file` substitui a configuração de lifecycle do bucket; portanto, não deve ser executado às cegas.

## Arquivos legados

Os comprovantes antigos estão em `empresas/{companyId}/receipts/{userId}/...`. Como `matchesPrefix` não aceita curingas no meio do caminho, não existe uma regra única segura que atinja somente esses arquivos sem também alcançar imagens permanentes.

Foi incluído `functions/scripts/cleanupLegacyTripReceipts.js`, que é **dry-run por padrão**. Ele nunca apaga documentos de viagem e só considera objetos cujo caminho corresponda exatamente ao padrão legado de receipts e cuja criação tenha pelo menos 45 dias. O modo `--apply` deve ser usado apenas após revisar a saída do dry-run.

## Observação de segurança

O sistema atual registra a viagem como concluída no momento do lançamento; não existe um campo separado que comprove revisão humana. A mensagem visual usa “Viagem verificada” no sentido de validação concluída pelo sistema. Se futuramente houver revisão humana obrigatória, a retenção deverá considerar `verifiedAt` antes de permitir a exclusão.

## Etapa 2 — auditoria do legado

A versão atual também inclui `functions/scripts/auditLegacyTripReceipts.js`, exclusivamente de leitura. Ele gera um inventário dos comprovantes legados com 45 dias ou mais, incluindo quantidade e espaço potencialmente liberável. Consulte `docs/AUDITORIA_LEGADO_PRINTS_ETAPA_2.md`.
