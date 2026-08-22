# HF78 — Achados da auditoria completa

## Escopo

Auditoria sobre a HF77 dos fluxos de detecção de telas, saída/retorno ao GTO, continuidade MediaProjection, saúde da bolinha, seleção de frete e recuperação quando Carga/Origem/Destino não são validados.

## Evidências iniciais

A sessão atual possui supervisão de foreground a cada 350 ms, captura com ImageReader de três buffers, callbacks de `onImageAvailable`, barreira de estabilidade, rebind de ImageReader/VirtualDisplay e um caminho separado de sondagem visual durante atraso de UsageStats.

A bolinha usa contrato estrito de saúde baseado em GTO foreground, análise não pausada, estabilidade da captura, recursos vivos e frame/análise recentes. Isso evita um falso ativo simples, mas a auditoria ainda precisa verificar se os mesmos predicados controlam o roteamento de frames e a transição de retorno.

A criação de VirtualDisplay é tratada como operação de uso único por autorização. Falhas antes da tentativa de criação tentam preservar o grant; falhas depois da tentativa armam nova autorização. `MediaProjection.Callback.onStop()` é tratado como revogação autoritativa. O rebind de ImageReader tenta preservar a mesma autorização.

Pontos de risco a confirmar: retorno antecipado em `onImageAvailable`, dependência residual de `foregroundPackage`/bridge, falhas silenciosas em callbacks OCR, estados duráveis que podem atravessar uma nova seleção, e comparação do frete lido no pause com o frete atualmente selecionado.

## Regra da auditoria

Nenhuma alteração ou release deve ser considerado seguro apenas porque o supervisor continua agendado. É necessário provar que frames recentes são processados, que decisões ficam bloqueadas enquanto o GTO não é confirmado e que o ramo de pendência não oferece manual antes de pause/OCR controlado.
