# GTO — transição para trabalho e registro automático

## Escopo

Esta implementação altera somente empresas/operações cujo simulador resolve para `GTO` / `Global Truck Online`.
ATS, ETS2, TOE3 e os demais simuladores continuam usando o formulário manual de **Lançar Viagem** sem mudanças no fluxo de gravação.

## Fluxo web (Google AI Studio / Netlify)

- No painel do motorista e no perfil operacional, o botão passa de **Lançar Viagem** para **Iniciar trabalho** somente no GTO.
- **Iniciar trabalho** envia o contexto operacional atual ao plugin nativo e abre o Global Truck Online.
- A rota `/driver/trip` continua existindo para os demais simuladores. Se uma navegação antiga tentar abrir essa rota para GTO, o formulário manual é bloqueado e aparece apenas **Iniciar trabalho**.

Contexto enviado ao Android:

- motorista
- empresa NVU
- trabalho/operação
- contrato
- veículo
- reboque

## Fluxo nativo

O FIX16 continua responsável pela identificação no jogo. O detector de frete não foi substituído por esta integração.

Ao iniciar uma nova viagem, o Android cria um `gtoTripSessionId` único. Após o recebimento normal da entrega, cria um payload com:

- carga
- empresa de origem
- destino
- km
- valor ofertado
- valor final recebido
- contexto operacional NVU
- status de conclusão

O payload é persistido em uma fila local antes da chamada de rede. Se houver perda de conexão/processo, a fila permanece e é reenviada depois. A fila é separada por identidade do motorista para não enviar uma viagem de outro usuário em aparelhos compartilhados.

## Backend

A callable Function `registerGtoTrip` é a única responsável por criar a viagem automática em `historico_viagens`.

Ela valida:

- autenticação Firebase
- motorista dono do trabalho
- empresa/contrato do trabalho
- operação em estado que aceita viagens
- empresa realmente GTO
- veículo/reboque vinculados à empresa
- conclusão normal (sem bônus/ADS)
- campos obrigatórios do frete

O `tripId` é determinístico a partir de motorista + sessão GTO. Uma repetição da mesma requisição retorna a viagem já criada em vez de duplicá-la, inclusive se a primeira resposta tiver sido perdida depois de a operação mudar para `awaiting_completion`.

A viagem automática reutiliza os campos canônicos do lançamento manual (`companyId`, `driverId`, `jobId`, `completedAt`, `valor`, etc.) e depois recalcula `trabalhos.progress`, mantendo histórico/ranking/operação no mesmo conjunto de dados.

Campos adicionais permitem identificar a origem automática:

- `source: "gto_auto"`
- `registroAutomatico: true`
- `automationSource: "gto-native-v1"`
- `gtoTripSessionId`
- `gtoCargo`
- `gtoOriginCompany`
- `gtoDestination`
- `gtoDistanceKm`
- `gtoOfferedValue`
- `gtoFinalValue`

## Ordem de implantação

1. Implantar a nova Function:

```bash
firebase deploy --only functions:registerGtoTrip --project vtc-frota-log
```

O `firebase.json` já executa o build TypeScript das Functions no predeploy.

2. Gerar o build do projeto web atualizado e publicar a pasta `dist` no Netlify pelo fluxo já usado pela NVU.

3. Gerar e instalar o APK baseado no projeto Capacitor entregue junto com esta etapa.

## Resultado esperado

GTO:

`Operação atual → Iniciar trabalho → GTO → Iniciar viagem → frete identificado → entrega → recebimento normal → registro automático → histórico/ranking/progresso`

Demais simuladores:

`Operação atual → Lançar Viagem → formulário manual existente`
