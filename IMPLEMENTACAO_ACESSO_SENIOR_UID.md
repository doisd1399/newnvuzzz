# Implementação do acesso Sênior por UID

## O que mudou

- A senha não é mais comparada no navegador nem aparece no bundle web.
- O login atual continua sendo Google/Firebase Authentication.
- Na primeira validação bem-sucedida, a Cloud Function `authenticateSeniorAccess`
  grava o custom claim `senior: true` no UID autenticado e sincroniza o perfil
  `users/{uid}`.
- O cliente atualiza o token imediatamente; não é necessário sair e entrar de
  novo.
- Nos próximos acessos, o Firebase reconhece o UID pelo claim, sem cadastro de
  e-mail e sem repetir a senha.
- Cinco tentativas inválidas dentro da janela de proteção bloqueiam novas
  tentativas por 30 minutos para aquele UID.
- `generateNvuNewsBackfill` e `syncCompanyApprovalNews` agora exigem claim
  Sênior. A NVU News não dispara essas rotinas pesadas automaticamente para
  usuários comuns.
- O usuário não consegue mais alterar sozinho `role`, `roles`, `status` ou
  `companyId` para se promover. A criação da própria empresa continua
  compatível com a ativação do proprietário.

## Deploy

O `firebase.json` agora compila `functions/src` automaticamente antes do
deploy. Publique Functions, regras e frontend da mesma versão. Depois, entre
com a conta que deve administrar o sistema e valide o acesso na tela do Painel
Sênior uma vez.

O hash padrão mantém a senha de acesso já utilizada pelo app para que nenhuma
configuração manual de e-mail ou UID seja necessária. Para trocar a senha no
futuro, configure `SENIOR_PANEL_PASSWORD_HASH` com o SHA-256 de
`nvu-senior-v1:<nova-senha>` no ambiente das Functions.
