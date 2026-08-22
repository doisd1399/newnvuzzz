# NVU R3.34-PC-HF63 — Auditoria crítica de estabilidade da detecção

## Sintoma reproduzido

Nas três capturas fornecidas pelo teste beta, a tela real do GTO continua exibindo uma lista válida de cinco fretes e cinco botões **Aceitar**, mas o NVU pode mostrar **“Aguardando a tela do GTO estabilizar”** e depois retirar/minimizar o card como se o GTO tivesse deixado de ser a tela ativa.

As três capturas foram incorporadas como fixtures de regressão em `scripts/fixtures/hf63-return-freight/`. O detector de produção `GtoFastVisualDetector` reconhece as três como lista de fretes válida com exatamente 5 linhas.

## Causa raiz

O problema não estava no reconhecimento visual da lista. O bloqueio acontecia antes dele.

O serviço usa `UsageStats/UsageEvents` do Android para saber qual pacote está em primeiro plano. Após uma ligação, navegador, launcher ou outro app, alguns Android/OEMs mantêm por alguns instantes — ou repetem na janela consultada — o último evento do app terceiro mesmo quando o motorista já voltou visualmente para o GTO.

No fluxo `WAITING_FREIGHT`, o código anterior recusava deliberadamente qualquer frame quando `UsageStats` apontava um app terceiro conhecido. Isso criava um deadlock circular:

1. o GTO já estava visível e o MediaProjection podia estar entregando pixels atuais;
2. `UsageStats` ainda dizia que outro app era o foreground;
3. por causa disso o NVU pausava a análise;
4. os frames atuais não eram analisados;
5. sem analisar os pixels atuais, a própria lista do GTO nunca podia provar que o motorista havia retornado ao simulador.

Havia ainda uma segunda fonte de oscilação: `refreshForegroundPackage()` consulta uma janela com sobreposição. Um evento antigo do app terceiro podia ser visto novamente no poll seguinte e desfazer uma recuperação visual que acabara de marcar o GTO como ativo.

## Correção HF63

### 1. Probe visual de retorno independente do pacote atrasado

Durante uma pausa de foreground, se já existe uma sessão MediaProjection GTO verificada, token/display vivos, geometria horizontal e o NVU MainActivity não está aberto, o serviço mantém somente o detector visual OCR-free de lista ativo.

Esse probe **não confia no nome do app terceiro** e não concede autoridade de viagem. Ele apenas permite que pixels atuais sejam examinados.

### 2. Dupla confirmação visual

A recuperação exige **duas telas consecutivas** com assinatura estrita de lista de fretes dentro de uma janela curta. Só então o foreground GTO é restaurado.

A prova visual não seleciona frete, não altera `tripState`, não confirma valor e não cria viagem. Todas as provas semânticas de Aceitar/valor/linha continuam funcionando exatamente depois da barreira normal de estabilidade.

### 3. Pixels atuais prevalecem sobre evento antigo

Se a prova visual GTO tem timestamp igual ou posterior ao último evento UsageStats observado, ela prevalece sobre aquele evento antigo. Um evento de foreground realmente mais novo continua vencendo. Assim um app terceiro aberto de verdade não é mascarado, mas um evento velho não consegue mais derrubar o detector a cada poll.

### 4. Recuperação de captura preservada

O watchdog existente continua responsável por:
- detectar ausência de frames;
- reconectar `ImageReader` à mesma `VirtualDisplay` sem consumir outra autorização;
- repetir rebind sem limite artificial de tentativas;
- tratar `MediaProjection.Callback.onStop()` como revogação real do token;
- preservar o estado durável da viagem e armar nova autorização quando o Android exigir um token novo.

## Invariantes de segurança preservados

- app terceiro real não recebe autoridade GTO apenas pelo `UsageStats` estar inconsistente;
- NVU MainActivity e superfícies transitórias do sistema vetam o probe;
- somente sessão de captura previamente verificada do GTO pode usar a recuperação visual;
- a prova de retorno é visual e não destrutiva;
- seleção continua dependente do toque humano + linha consistente + evidência semântica;
- resultado/viagem concluída continua usando a proteção HF55/HF60/HF61 já existente;
- HF62 bootstrap-coordinate permanece integral.

## Regressões executadas

Foram executados com sucesso, entre outros:

- `check:android-java-syntax` — 53 fontes: PASS
- HF29 post-consent/list recovery — 11/11
- HF30 continuous projection — 24/24
- HF32 continuous recognition — 18/18
- HF34 deterministic lifecycle — 22/22
- HF35 freight-list authority — 10/10
- HF36 cargo auto-recovery — 11/11
- HF43 responsive messages — 17/17
- HF44 live-list message — 17/17
- HF45 critical flow — 18/18
- HF48 return recognition — 17/17
- HF55 return-result recovery — 20/20
- HF57 instant messages — 20/20
- HF59 Sync Safe — 29/29
- HF60 Terminal Safe — 29/29
- HF61 Completion Commit — 29/29
- HF62 Bootstrap Coordinate — 10/10 + R3.24 14/14
- HF63 return-freight recovery — 20/20
- teste Java com as três capturas exatas enviadas: PASS, 5 fretes reconhecidos em cada imagem.

## Limite real do Android

Nenhum app Android pode garantir captura eterna se o sistema operacional **revogar o token MediaProjection, matar o processo ou exigir novamente consentimento de captura**. Essa autorização é uma barreira de segurança controlada pelo Android e não pode ser contornada legitimamente.

O objetivo técnico do HF63 é eliminar as falhas recuperáveis dentro de uma sessão válida: stale UsageStats, app switch, retorno ao simulador, rebind de superfície, oscilação de foreground e continuidade do estado. Quando o Android realmente exigir um novo token, o NVU preserva a operação e aciona o fluxo de reautorização, em vez de ficar silenciosamente morto.
