# NVU R3.34 PC HF80 — Relatório de causa raiz e validação

## Resultado executivo

O HF80 corrige a última inconsistência estrutural identificada no fluxo **pause-first**. O APK release foi compilado, alinhado, assinado e verificado como **com.nvu.operacional, versionCode 131, versionName 1.0.131**. As regressões estruturais HF66–HF80 passaram.

A validação confirma a integridade do artefato e da cadeia estática de execução, mas **não substitui um teste físico no GTO**: este ambiente não possui dispositivo Android nem ADB conectado. Por esse motivo, o relatório não afirma que o comportamento visual em um aparelho foi observado; afirma somente o que foi objetivamente demonstrado por código, testes de regressão e build/assinatura.

## Causa raiz final

Havia duas falhas complementares.

A primeira era um deadlock no armamento do OCR. O alerta podia estar marcado como visível (`pausePromptVisible=true`) enquanto `pauseScreenDetectedAt` ainda era zero. Como `maybeAnnouncePausePrompt` só seguia para `schedulePauseScreenOcrIfDue` quando `pauseScreenDetectedAt > 0L`, o primeiro OCR dependia de uma confirmação que só poderia ser produzida por um OCR anterior. O resultado era um estado visualmente alertado, porém sem releitura efetivamente agendada.

A segunda era uma perda de roteamento durante atraso do `UsageStats`/foreground. Depois que o usuário saía do GTO e retornava, a sessão de captura MediaProjection podia continuar autorizada e entregar frames, mas o foreground detectado ainda podia estar stale. Nesse cenário, `onImageAvailable` mandava o frame de `CONFIRMING_FREIGHT` para `consumeCaptureStabilityFrame`, uma rota de saúde/estabilidade que preservava a captura, mas não executava o detector específico da tela pause nem o OCR dos campos pendentes. A bolinha podia continuar indicando uma sessão viva enquanto a cadeia funcional de releitura não avançava.

## Correção HF80

O serviço agora possui `consumePauseRecoveryFrame`, uma rota explícita para frames recebidos durante foreground lag quando a sessão MediaProjection está autorizada e o estado atual é elegível para recuperação do pause. Essa rota executa o detector visual, passa pelo gate do alerta, agenda o OCR do pause e mantém o estado `CONFIRMING_FREIGHT` isolado do descarte genérico.

A interceptação é feita em `onImageAvailable` antes de `consumeCaptureStabilityFrame`. O caminho de recuperação não depende de `gtoForeground=true` para armar a primeira releitura, desde que a captura autorizada esteja viva e o frete atual esteja em confirmação.

Além disso, `maybeAnnouncePausePrompt` aceita `pauseScreenDetectedAt > 0L || pausePromptVisible` para que um prompt já emitido continue armando o OCR mesmo antes da primeira confirmação visual persistida. O fallback manual permanece posterior à tentativa do pause.

## Fluxo garantido pelo código

| Etapa | Comportamento verificado |
|---|---|
| Frete atual com campo pendente | Estado `CONFIRMING_FREIGHT` permanece elegível para recuperação do pause. |
| Captura após troca de aplicativo | Sessão MediaProjection autorizada é interceptada pela rota pause-first mesmo com foreground stale. |
| Primeiro alerta | Gate condicionado a frete selecionado e pendência real de Carga, Origem ou Destino. |
| Primeira releitura | OCR do pause é agendado sem depender de uma confirmação anterior já persistida. |
| Detecção real | Política HF79 reconhece categorias independentes dos rótulos reais: Ajustes, Cancelar frete, Chamar Guincho e Voltar ao menu. |
| Extração | Campos pendentes são lidos; Origem/Destino usam o local após o último separador confiável Empresa → Local. |
| Segurança | Campo sem separador confiável permanece pendente, sem assumir o nome da empresa como local. |
| Validação | Resultado é comparado com o snapshot do frete atual e mismatch é bloqueado. |
| Conclusão | Lock durável e transição para `TRIP_IN_PROGRESS` ocorrem somente após validação bem-sucedida. |
| Fallback | Preenchimento manual só aparece depois da falha controlada da tentativa pause-first. |

## Testes executados

As regressões abaixo passaram no versionCode 131:

| Regressão | Resultado |
|---|---|
| HF80 — pause recovery frame routing | PASS |
| HF79 — pause detection first attempt | PASS |
| HF78 — end-to-end audit | PASS |
| HF77 — pause location parser | PASS |
| HF76 — capture continuity | PASS |
| HF75 — pause order | PASS |
| HF70 — pause alert gate | PASS |
| HF69 — observer persistent lifecycle | PASS |
| HF72 — GTO automated start audio | PASS |
| HF71 — pause alert audio | PASS |
| HF66 — observer supervisor | PASS, 9/9 checks |

Também passaram:

```text
:app:compileDebugJavaWithJavac — BUILD SUCCESSFUL
:app:assembleRelease — BUILD SUCCESSFUL
```

## Validação do APK

O artefato entregue foi verificado com `aapt2 dump badging`:

```text
package: name='com.nvu.operacional' versionCode='131' versionName='1.0.131'
compileSdkVersion='36'
targetSdkVersion:'36'
```

A assinatura foi verificada com APK Signature Scheme v2 e v3. O APK possui um único signatário RSA de 2048 bits, correspondente ao certificado do keystore fornecido. O SHA-256 do APK assinado é:

```text
f0ca9af5efcbe58eeecca56972d15f7d3a88c5b14402d5313f620dc6d8dd5de2
```

As credenciais do keystore não foram gravadas neste relatório, nos metadados, no ZIP-fonte ou no APK.

## Limitação objetiva

Não há dispositivo Android, ADB ou execução do GTO disponível neste ambiente. Portanto, não foi possível repetir fisicamente o ciclo `NVU → GTO → sair do GTO → retornar ao GTO → abrir lista de fretes → detectar → selecionar/aceitar frete`. A evidência disponível é de análise estrutural, regressões automatizadas sobre os contratos do código, compilação release e verificação criptográfica do APK. O teste físico no aparelho continua recomendado antes de distribuição ampla.

## Arquivos de evidência

O projeto contém os logs de compilação, `hf80_apksigner_verify.txt`, `hf80_aapt2_badging.txt`, `hf80_sha256.txt`, os metadados HF80 e a nova regressão `test-gto-r3-34-hf80-pause-recovery-frame-routing.mjs`.
