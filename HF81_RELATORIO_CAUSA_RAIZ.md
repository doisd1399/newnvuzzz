# NVU R3.34 PC HF81 — Leitura obrigatória de Carga, Origem e Destino no menu pause

## Decisão de entrega

O código HF81 foi corrigido, as regressões passaram e o APK release 1.0.132 foi compilado, alinhado, assinado e verificado. O APK está sendo entregue a pedido explícito do usuário. **A entrega não constitui afirmação de 100% de precisão**, porque este ambiente não possui dispositivo Android/ADB conectado para executar o GTO com a tela real e porque OCR em imagem é probabilístico.

## Causa raiz observada

A tela anexada contém, na mesma área de leitura, os valores:

```text
Carga: Bebidas
Origem: Cooper Log – Cruz do Oeste
Destino: Supermercado Santo Antonio – Nova Macaé
```

A implementação anterior tinha duas falhas.

Primeiro, `GtoPauseScreenDetectionPolicy.valueAfterLabel` normalizava a linha inteira antes de devolver o valor. Essa normalização substituía o separador `–` por espaço. Consequentemente, o parser seguro `GtoPauseLocationParser.extractAfterLastSeparator` recebia algo equivalente a `Cooper Log Cruz do Oeste`, não encontrava um separador confiável e devolvia vazio. A Origem permanecia pendente mesmo quando o OCR havia capturado a linha.

Segundo, `readPauseFreight` só chamava a leitura do pause para os campos considerados pendentes. Dessa forma, um valor anterior incorreto de Origem ou Destino podia ser reutilizado em vez de ser substituído pela leitura da tela pause. Isso explica a divergência mostrada: o menu pause apresentava os dados completos, mas a revisão do NVU continuava mostrando Origem não confirmada e oferecia preenchimento manual.

## Correção HF81 aplicada

`valueAfterLabel` agora preserva primeiro o trecho bruto após `Carga:`, `Origem:` ou `Destino:`, mantendo hífen, en dash e em dash. O parser Empresa → Local é executado sobre esse texto bruto e extrai somente o trecho após o último separador confiável. Se não houver separador, o campo continua pendente; o sistema não assume o nome da empresa como local.

`readPauseFreight` e `readPauseFreightWithoutCompleteness` agora relêem obrigatoriamente os três campos operacionais em cada tentativa confirmada do menu pause:

| Campo | Regra HF81 |
|---|---|
| Carga | Sempre relida por âncora de texto; linha ausente permanece pendente. |
| Origem | Sempre relida; o valor canônico é o local depois do último separador Empresa → Local. |
| Destino | Sempre relido; o valor canônico é o local depois do último separador Empresa → Local. |

Após a leitura, o serviço só persiste os valores e chama `transitionConfirmedFreightToTripInProgress()` quando os três campos estão utilizáveis, a identidade da linha selecionada permanece válida, a validação do snapshot não falha, o lock durável é criado e a persistência retorna sucesso. A falha de qualquer etapa mantém a pendência e agenda nova tentativa; o manual continua sendo último recurso.

## Regressões executadas

| Regressão | Resultado |
|---|---|
| HF81 — mandatory reread de Carga/Origem/Destino | PASS |
| Teste unitário de `valueAfterLabel` + parser | PASS |
| HF80 — roteamento do frame no foreground lag | PASS |
| HF79 — detecção dos rótulos reais do pause | PASS |
| HF78 — auditoria de validação e contrato origin-local | PASS |
| HF77 — parser Empresa → Local | PASS |
| HF70 — gate de alerta condicionado à pendência | PASS |
| HF69 — observador persistente | PASS |
| HF72 — áudio de abertura automatizada | PASS |
| HF71 — áudio do alerta pause | PASS |
| HF66 — supervisor do observador | PASS, 9/9 checks |

Também passaram:

```text
:app:compileDebugJavaWithJavac — BUILD SUCCESSFUL
:app:assembleRelease — BUILD SUCCESSFUL
```

O APK interno foi identificado com `aapt2` como:

```text
package: name='com.nvu.operacional' versionCode='132' versionName='1.0.132'
targetSdkVersion:'36'
```

A assinatura interna foi verificada com APK Signature Scheme v2 e v3. SHA-256 interno do APK assinado:

```text
ced9f86ef56bf8508dc9fee1c1d10e0752625c2f94af2282dce19370d9579435
```

## Limitação que impede a garantia de 100%

Não há dispositivo Android, ADB nem execução do GTO disponíveis no ambiente. Portanto, não foi possível comprovar fisicamente, com a imagem real e o ML Kit em execução, que todas as variações de escala, foco, compressão, iluminação, acentos e quebras de linha produzirão OCR perfeito. Os testes demonstram que, quando o OCR entrega as âncoras e os separadores presentes na tela anexada, o código preserva, extrai, valida e aplica corretamente os três campos. Eles não permitem afirmar que o OCR acertará 100% de todas as capturas reais.

A pedido explícito do usuário, o APK release assinado foi gerado e está anexado junto com o fonte e este relatório. Recomenda-se instalação controlada e execução do ciclo físico no aparelho antes de distribuição ampla.
