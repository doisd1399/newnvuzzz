# HF93 — Máquina generalizada de reidratação visual por estado de tela

## Objetivo

A HF93 separa a saúde do transporte da interpretação da tela atual. A bolinha permanece sob a autoridade HF92 de snapshot atômico, histerese e `RECOVERY_IN_FLIGHT`. A nova máquina interpreta frames/OCR da geração atual e reidrata o contexto visível após uma troca de aplicativo ou retorno ao GTO.

## Estados de contexto

| Estado | Confirmação | Reidratação |
|---|---|---|
| `FREIGHT_LIST` | Três frames com assinatura compatível de painel, dimensões e geometria dos botões **Aceitar** | Reabre o ciclo da lista, atualiza frescor, rearma o sensor e permite ação apenas na geração confirmada |
| `PAUSE` | Três observações OCR com âncoras estruturais de pause/Carga/Origem/Destino; o texto completo não é usado como assinatura | Marca o menu atual como confirmado e entrega o frame ao fluxo existente de releitura obrigatória |
| `ACTIVE_TRIP` | Três frames atuais fora da lista/resultado enquanto há sessão durável em andamento | Reassocia a tela ao frete em andamento sem apagar o estado durável |
| `RESULT` | Três frames com o detector visual de modal de conclusão; OCR semântico existente continua sendo a autoridade para finalizar | Marca o contexto de conclusão candidato e mantém a confirmação semântica no fluxo de resultado |

## Contrato por geração

Cada observação leva `projectionGeneration`. Quando a geração muda, candidatos e confirmações antigas são descartados. Uma confirmação exige três observações compatíveis e uma lacuna maior que 950 ms reinicia o candidato. Callbacks de uma tela ou reader anterior não podem reidratar o estado atual.

A assinatura da lista é tolerante a pequenas variações visuais: dimensões, quantidade de botões, amostras do painel quantizadas e coordenadas quantizadas. Isso evita que uma animação de poucos pixels impeça a confirmação, sem aceitar uma tela estruturalmente diferente.

## Reidratação e ações

A reidratação é idempotente. Ao confirmar uma lista, o serviço preserva o transporte, marca `freightListCycleSeen`, atualiza `lastFreightListSeenAt`, rearma o sensor passivo e publica `visualContextActionsArmed` para a geração atual. O foreground/UsageStats stale não bloqueia uma lista confirmada por frames atuais. O toque continua protegido por geração, transporte operacional, ausência da atividade NVU e contexto visual confirmado.

A confirmação de pause é integrada ao OCR existente. A máquina reconhece o pause mesmo quando o fluxo não está no ramo de recuperação de frete, mas a releitura e as mutações continuam sujeitas à política existente: Carga, Origem e Destino devem ser relidos, validados e somente depois a viagem pode ser iniciada/continuada.

A classificação de resultado é apenas um candidato visual; a conclusão permanece subordinada ao OCR semântico já existente. Isso evita que pixels de um modal incompleto mudem o estado durável sem `Concluído` e valor confirmados.

## Diagnóstico exportado

O plugin passa a expor `visualContextGeneration`, `visualContextState`, `visualContextSignature`, `visualContextConsecutiveFrames`, `visualContextChangedAt`, `visualContextActionsArmed` e `visualContextLastBlockedReason`. Esses campos permitem distinguir transporte saudável de contexto ainda não confirmado.

## Validações

Passaram a regressão HF93, as regressões HF92/HF91/HF90/HF89/HF74 e o teste unitário `GtoVisualContextStateMachineTest`. A compilação Java debug e `assembleRelease` passaram. O APK foi zipaligned, assinado e verificado pelas assinaturas v2 e v3.

```text
package: com.nvu.operacional
versionCode: 144
versionName: 1.0.144
targetSdkVersion: 36
SHA-256 do APK: fd28dd9c82c29aa2bfe35bd56708b4f506f6b0eca81ef345d6e183460f507d84
```

## Limitação

O ambiente não possui dispositivo Android/ADB. A implementação cobre as quatro famílias de tela por contratos de geração e testes offline, mas o ciclo físico NVU → GTO → sair → retornar precisa ser executado no aparelho para confirmar os tempos, OCR e geometria específicos do OEM.
