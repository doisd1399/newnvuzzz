# Sistema NVU

Plataforma de gestão operacional e logística para empresas e motoristas.

## Executar localmente

Pré-requisito: Node.js.

1. Instale as dependências: `npm install`.
2. Copie `.env.example` para `.env.local` e preencha as variáveis necessárias do Firebase/ambiente.
3. Execute: `npm run dev`.

## Validações do projeto

- `npm run lint`
- `npm run audit:firebase-costs`
- `npm run audit:legacy-notifications`

As Cloud Functions possuem build próprio em `functions/` e são compiladas automaticamente pelo predeploy do Firebase.
