# NVU R3.34 PC HF82 — Correção da autoridade de releitura do menu pause

## Causa raiz definitiva

A falha persistia por uma contradição no contrato de validação. O menu pause deveria corrigir Carga, Origem e Destino, mas `validatePauseFreightAgainstCurrentReview` comparava os valores novos do pause com os valores antigos do primeiro OCR da lista de fretes. Quando o primeiro OCR havia preenchido um Destino incorreto, como `Averbecboo`, a leitura correta do pause, como `Nova Macaé`, era classificada como `mismatch`; o resultado nunca era persistido e a transição automática não acontecia.

Esse bloqueio ocorria mesmo depois de o parser Empresa → Local e a releitura obrigatória do HF81 terem sido corrigidos. Portanto, a causa não era mais somente a extração do separador: era a **autoridade de validação invertida**, que tratava o OCR antigo como referência superior ao menu pause que o usuário acabou de abrir para corrigir os dados.

## Correção HF82

A leitura do menu pause agora é autoridade para substituir Carga, Origem e Destino obtidos por OCR anterior. A validação continua protegendo a identidade da linha selecionada, distância, valor e lock durável. Se um dos três campos tiver sido digitado explicitamente pelo motorista (`MANUAL_DRIVER`), a divergência continua sendo bloqueada para impedir substituição silenciosa de uma correção manual.

O fluxo final é:

| Etapa | Regra |
|---|---|
| Seleção | A linha selecionada precisa manter identidade confirmada. |
| Pause | O detector reconhece os rótulos reais do GTO. |
| OCR | Carga, Origem e Destino são relidos obrigatoriamente. |
| Origem/Destino | O texto bruto preserva `–`, `-` e `—`; o parser extrai o local após o último separador. |
| Autoridade | A releitura do pause substitui valores antigos de OCR; valores manuais explícitos permanecem protegidos. |
| Validação | Linha, distância e valor continuam sendo âncoras do frete atual. |
| Persistência | Os três campos corrigidos são gravados em `selectedFreight`, `selectedCargo`, `selectedOrigin` e `selectedDestination`. |
| Início | Somente após persistência, lock e validação bem-sucedidos ocorre `transitionConfirmedFreightToTripInProgress()`. |

## Evidências executadas

Passaram as regressões HF82, HF81, HF80, HF79, HF78, HF77, HF70, HF69, HF72, HF71 e HF66. A regressão HF82 verifica especificamente que o pause pode substituir um Destino antigo de OCR e que entradas manuais continuam protegidas.

Também passaram:

```text
:app:compileDebugJavaWithJavac — BUILD SUCCESSFUL
:app:assembleRelease — BUILD SUCCESSFUL
```

O APK final foi identificado por `aapt2` como:

```text
package: name='com.nvu.operacional' versionCode='133' versionName='1.0.133'
targetSdkVersion:'36'
```

A assinatura foi verificada com APK Signature Scheme v2 e v3. SHA-256 do APK assinado:

```text
482298299c5b424ec678d4b138093a2491a056f9543753519e4a02df470480a1
```

## Limitação

Não há dispositivo Android/ADB disponível neste ambiente para executar o GTO fisicamente. A correção foi validada por análise do fluxo nativo, regressões de contrato, compilação e verificação criptográfica do APK. O teste físico no aparelho continua recomendado para confirmar o comportamento do ML Kit sob as condições reais de captura.
