# Etapa 15 — auditoria não destrutiva de imagens órfãs

## Objetivo

Registrar imagens do Firebase Storage que podem ter ficado órfãs após a troca ou exclusão de foto de usuário, logo de empresa ou foto do proprietário, sem apagar qualquer arquivo.

## Modo de funcionamento

- Foram criados gatilhos para atualizações e exclusões de documentos em `users` e `frotas`.
- Quando uma referência antiga deixa de existir no documento, o caminho é registrado em `storage_cleanup_candidates`.
- Cada candidato recebe prazo de segurança de 30 dias.
- A exclusão real permanece desativada por código: `dryRun: true` e `deletionEnabled: false`.
- Não existe chamada a `deleteObject` nem a `bucket.file(...).delete()`.
- Se o mesmo caminho voltar a ser referenciado posteriormente, o candidato é cancelado automaticamente.
- URLs externas, imagens `data:`, URLs `blob:` e buckets que não pertencem ao projeto são ignorados.
- Tokens de download presentes na query string das URLs não são persistidos na coleção de auditoria.
- Registros duplicados são deduplicados por hash de `bucket + storagePath`.

## Campos monitorados

### Usuários

- `profilePhotoURL`, `profilePhotoUrl`
- `photoURL`, `photoUrl`
- `avatarURL`, `avatarUrl`, `avatar`
- `profileImage`, `imageURL`, `imageUrl`
- aliases legados de foto
- caminhos explícitos terminados em `StoragePath`

### Empresas

- `logoUrl`, `logoURL`, `logo`
- `companyLogoURL`, `companyLogoUrl`, `companyLogo`
- aliases legados de logo
- `ownerPhotoUrl`, `ownerPhotoURL`, `ownerPhoto`
- `logoStoragePath`, `companyLogoStoragePath`, `ownerPhotoStoragePath`

## Proteção da coleção

A coleção `storage_cleanup_candidates` recebeu regra explícita de bloqueio para clientes. Somente Cloud Functions usando Admin SDK podem gravar os registros.

## Limitações intencionais

- Esta etapa detecta substituições e exclusões futuras após o deploy.
- Não realiza varredura global do bucket nem das coleções antigas.
- O campo `stillReferenced` inicia como desconhecido, pois nenhuma consulta global cara é feita para localizar referências em outros documentos.
- Nenhum candidato será apagado automaticamente nesta etapa.

## Arquivos modificados

- `functions/src/storageCleanupAudit.ts`
- `functions/src/index.ts`
- `functions/lib/storageCleanupAudit.js`
- `functions/lib/storageCleanupAudit.js.map`
- `functions/lib/index.js`
- `functions/lib/index.js.map`
- `firestore.rules`
- `scripts/audit-firebase-costs.mjs`

## Ativação futura

A auditoria só começará a registrar candidatos depois da publicação das Cloud Functions e das regras do Firestore. O deploy foi mantido para a etapa final, conforme definido no roteiro.
