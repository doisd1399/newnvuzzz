# Etapa 26 — correção do acesso temporário às imagens

## Causa raiz

O erro `The requested file could not be read...` era gerado no dispositivo antes do Firebase Storage.

No lançamento de viagens, o mesmo `File` fornecido pelo seletor do Android era lido simultaneamente por três rotinas:

- criação do hash antifraude;
- OCR local do valor da viagem;
- compactação e envio ao Storage.

Algumas galerias e provedores de arquivos do Android entregam uma referência temporária baseada em `content://`. Depois que o seletor encerra ou quando existem leituras concorrentes, essa permissão pode ser invalidada e o navegador retorna `NotReadableError`.

## Correções aplicadas

- A imagem selecionada agora é copiada imediatamente, em uma única leitura, para um arquivo controlado pela memória do navegador.
- Hash, prévia, OCR e compactação utilizam somente essa cópia estável.
- O campo de arquivo é liberado imediatamente, permitindo selecionar novamente o mesmo arquivo após qualquer bloqueio ou falha.
- Erros nativos em inglês deixaram de ser exibidos ao usuário e passaram a receber mensagens orientativas em português.
- Falhas de leitura não são mais confundidas com rejeição das regras do Firebase Storage.
- O hash anterior é limpo ao iniciar uma nova seleção, impedindo estado visual ou antifraude desatualizado.
- A logo da empresa também passa a ser copiada no momento da seleção; antes, o arquivo temporário era guardado até o usuário pressionar **Salvar**, podendo perder a permissão.
- Fotos de perfil, cadastro de motorista, cadastro de empresa, recrutamento e tela interna de teste receberam a mesma proteção.
- O utilitário de Base64 agora registra corretamente falha ou cancelamento do `FileReader`.
- A compactação não retorna mais silenciosamente a imagem original quando não consegue decodificar a foto ou criar o canvas.

## Arquivos alterados

- `src/lib/fileAccess.ts`
- `src/lib/utils.ts`
- `src/services/uploadService.ts`
- `src/pages/driver/RecordTrip.tsx`
- `src/pages/admin/fleet/CompanyTab.tsx`
- `src/components/ProfileModal.tsx`
- `src/pages/admin/AddDriver.tsx`
- `src/pages/RegisterCompany.tsx`
- `src/pages/RecruitmentApply.tsx`
- `src/components/common/UploadTest.tsx`

## Escopo preservado

- regras e caminhos do Firebase Storage;
- limite autenticado de 2 MB e saída do comprovante abaixo de 1,8 MB;
- OCR local e validação antifraude por hash;
- Firestore, índices, Functions, ranking e notificações;
- layout e fluxo de lançamento de viagens.

Esta etapa é de frontend e não exige novo deploy de regras, índices ou Cloud Functions.
