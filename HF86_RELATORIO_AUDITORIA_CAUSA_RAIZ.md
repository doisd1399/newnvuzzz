# NVU R3.34 PC HF86 — Auditoria estrutural da perda de detecção após retorno ao GTO

## Causa raiz exata

A falha era estrutural: o serviço possuía **duas autoridades conflitantes** para decidir se a tela podia ser analisada.

A sessão MediaProjection podia continuar com `MediaProjection`, `VirtualDisplay`, `ImageReader`, `Handler` e frames recentes ativos. Porém, o pipeline decisório ainda exigia simultaneamente `gtoForeground`, `screenAnalysisPausedOutsideGto == false` e `hasFreshGtoForegroundEvidence`. Esses sinais dependiam de UsageStats ou de provas visuais específicas. Quando o usuário saía do GTO e retornava, o pacote foreground podia permanecer stale, vazio ou apontar temporariamente para o NVU. Nesse intervalo, o serviço mantinha a captura viva, mas bloqueava `isCaptureReadyForAnalysis`, invalidava callbacks OCR e deixava o detector em estado de “transporte ativo, análise congelada”.

O problema não era somente o FPS ou a velocidade. Era a falta de uma autoridade única para a sessão de análise.

## Correção arquitetural HF86

HF86 introduz `isFrameAnalysisSessionActive` como autoridade única para o pipeline de frames. A análise pode continuar enquanto todos os componentes reais da sessão estão ativos: autorização MediaProjection, token, VirtualDisplay, ImageReader, Handler, geometria landscape e serviço habilitado.

`keepFrameAnalysisSessionActive` reativa flags internas de forma idempotente quando um frame ou o supervisor encontra uma sessão válida. A recuperação não depende de pacote foreground, UsageStats, FPS, OCR, orientação textual ou qualquer outra prova visual específica.

A nova regra separa as responsabilidades:

| Camada | Autoridade HF86 |
|---|---|
| Transporte | MediaProjection, VirtualDisplay, ImageReader, Handler e frames reais. |
| Análise | Sessão de captura ativa + geometria + `GtoCaptureStabilityGate` com três frames estáveis. |
| Decisão | OCR, detector semântico, seleção, validação e estado da viagem. |
| Revogação | Somente `MediaProjection.Callback.onStop()` encerra a sessão autorizada e arma nova autorização. |

O callback de ImageReader antigo é descartado pelo teste de identidade `reader != imageReader`, sem interromper o ImageReader substituto. Quando a MediaProjection é realmente revogada, o callback `onStop()` marca a sessão inativa, pausa a análise e solicita nova autorização; uma ausência de UsageStats não tem mais esse poder.

## Simulação estrutural HF86

A simulação determinística executou cinco cenários:

| Cenário | Resultado |
|---|---|
| Foreground stale com frames contínuos | 100 frames analisados; nenhum descartado; recuperação sem pacote. |
| Retorno após o NVU | 132 frames analisados; nenhum descartado; decisão liberada após estabilidade. |
| Callback de ImageReader antigo | 20 frames antigos rejeitados; novo leitor continuou e produziu frames decisórios. |
| Revogação real da MediaProjection | Sessão realmente bloqueada; nova autorização restaurou a análise. |
| Polls repetidos do supervisor | 120 frames analisados; um único rearmamento; sem oscilação. |

## Evidências de build

Passaram a simulação HF86, as regressões HF66–HF85 e a compilação Java. O APK release foi montado com sucesso:

```text
:app:compileDebugJavaWithJavac — BUILD SUCCESSFUL
:app:assembleRelease — BUILD SUCCESSFUL
```

Identidade validada:

```text
package: name='com.nvu.operacional' versionCode='137' versionName='1.0.137'
targetSdkVersion:'36'
```

A assinatura v2/v3 foi verificada.

SHA-256 do APK:

```text
ce37ce72c0a58a95ed4cea5a7535be6d6da3c5acd970cc2d9d0b743ac0fdb1ed
```

## Limitação

Não há dispositivo Android/ADB disponível para executar fisicamente o ciclo `NVU → GTO → sair → retornar → detectar`. A simulação valida a máquina de estados, os bloqueios estruturais reproduzidos e a separação entre transporte e decisão, mas não substitui a execução no aparelho real nem contempla particularidades de todos os fabricantes Android.
