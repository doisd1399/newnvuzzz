# HF94 — Correção da autoridade da lista pós-retorno

## Evidência da reprovação

A captura do aparelho mostra cinco cartões de frete e cinco botões **Aceitar** visíveis no GTO, enquanto o NVU continua exibindo o estado equivalente a **“Escolha seu frete / Abra a lista de fretes”**. A bolinha branca está estável. Logo, o transporte e o indicador de saúde não eram a autoridade que falhou; a falha estava na promoção da tela visual para o fluxo de seleção.

## Causa raiz confirmada no código

A HF93 introduziu a máquina `GtoVisualContextStateMachine`, mas a integração manteve uma contradição com a autoridade legada:

1. O detector podia reconhecer `FREIGHT_LIST_VISUAL` e a máquina podia confirmar três frames atuais.
2. `onFreightFrameAvailable()` continuava tratando a lista como `FREIGHT_LIST_VISUAL` e gravava `freightCount = 0` enquanto `isFreightPageSemanticallyCertified()` não estivesse concluído.
3. `persistFreightRuntimeStatus()` só gravava `freightStructureAt` para o estado literal `FREIGHT_LIST`.
4. `notificationText()` usava somente `tripState == WAITING_FREIGHT` e, portanto, continuava exibindo a etapa genérica “escolha seu frete”.
5. `handlePreciseTouch()` ainda exigia `isCurrentGtoActionContext()` antes de consultar a lista visual confirmada; um `gtoForeground`/UsageStats stale podia bloquear o toque mesmo com os retângulos Aceitar atuais.
6. Durante a reconciliação pré-READY, o classificador só mantinha o heartbeat; não cacheava os retângulos `realtimeAcceptRects`, portanto a confirmação visual não tinha coordenadas acionáveis.

Isso explica por que a bolinha podia permanecer branca e a lista permanecer visível, mas a seleção não prosseguia.

## Correção HF94

A correção separa a autoridade de **existência da lista** da autoridade de **identidade semântica do frete**. Quando três frames da geração atual confirmam a mesma lista, o fluxo agora:

- promove `FREIGHT_LIST_VISUAL` para `FREIGHT_LIST` operacional;
- publica a contagem visual em `freightCount`;
- atualiza `screenState` e `freightStructureAt`;
- cacheia imediatamente o painel e os retângulos atuais de **Aceitar**, inclusive antes do gate de estabilidade ficar pronto;
- rearma o sensor e permite o commit preciso da seleção sem depender de foreground stale;
- mantém a certificação semântica para extrair e confirmar Carga/Origem/Destino, sem usar essa certificação como pré-requisito para reconhecer que a lista está na tela;
- altera o texto de status para “Lista de fretes detectada · N opções” quando a confirmação visual existe.

A saúde da bolinha, o `AtomicReference`, a histerese e o `RECOVERY_IN_FLIGHT` não foram enfraquecidos nem usados como paliativo.

## Validação

A regressão HF94 passou, o teste unitário da máquina de contexto passou, a compilação Java debug passou e `assembleRelease` passou. O APK foi alinhado e verificado com assinatura v2/v3.

```text
Pacote: com.nvu.operacional
Versão: 1.0.145
versionCode: 145
SHA-256 APK: 8e7323b007e289493289dba15847dded5666b9938fc101cf724cb6b12aad5bf1
```

## Limitação

Não há dispositivo Android/ADB neste ambiente. A causa da contradição foi confirmada estaticamente pelo código e pela evidência visual enviada, mas o teste físico final — retornar ao GTO com a lista aberta, observar a mudança para “Lista de fretes detectada” e tocar um botão Aceitar — ainda precisa ser executado no aparelho.
