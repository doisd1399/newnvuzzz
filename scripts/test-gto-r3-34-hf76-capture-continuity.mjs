import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"),
  "utf8",
);
const policy = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoProjectionContinuityPolicy.java"),
  "utf8",
);

assert.ok(service.includes("private boolean hasAuthorizedCaptureSession()"), "sessão autorizada deve ter predicado próprio");
assert.ok(service.includes('prefs.getBoolean("projectionGrantValidated", false)'), "sessão deve exigir grant validado");
assert.ok(service.includes("mediaProjection != null") && service.includes("virtualDisplay != null"), "sessão deve exigir token/display vivos");
assert.ok(service.includes("imageReader != null") && service.includes("captureHandler != null"), "sessão deve exigir leitor/handler vivos");
assert.ok(service.includes("boolean authorizedCaptureSessionAlive = hasAuthorizedCaptureSession()"), "onImageAvailable deve consultar sessão autorizada");
assert.ok(service.includes("|| authorizedCaptureSessionAlive"), "sessão autorizada deve manter consumo de frames");
assert.ok(service.includes("boolean verifiedSession = projectionVerifiedGtoBridgeActive"), "retorno deve preservar bridge em memória");
assert.ok(service.includes('prefs.getBoolean("projectionGrantValidated", false);'), "retorno deve usar grant durável quando bridge foi perdida");
assert.ok(service.includes("nvuMainActivityForeground = false;"), "recriação não pode restaurar NVU foreground stale");
assert.ok(policy.includes("mayProbeFreightReturnDuringForegroundLag"), "política de retorno deve permanecer aplicada");
assert.ok(service.includes("confirmPausedFreightReturnVisualCandidate"), "retorno ainda exige frames atuais de prova");
assert.ok(service.includes("captureStabilityGate.reset("), "retorno deve rearmar estabilidade");
assert.ok(service.includes("GTO_CAPTURE" ) || service.includes("consumeCaptureStabilityFrame(reader)"), "frames devem continuar na sonda");
assert.ok(service.includes("MediaProjection.Callback.onStop") || service.includes("public void onStop()"), "revogação Android deve ser o único encerramento de token");

const pollStart = service.indexOf("private final Runnable foregroundPoll");
const pollEnd = service.indexOf("private boolean isDetectorActive", pollStart);
const poll = service.slice(pollStart, pollEnd);
assert.ok(poll.includes("finally"), "supervisor deve sempre rearmar");
assert.ok(poll.includes("postDelayed(this, FOREGROUND_POLL_INTERVAL_MS)"), "supervisor deve continuar agendado");
assert.ok(poll.includes("maybeRecoverProjectionFrameDelivery(now)"), "supervisor deve reparar entrega");

console.log("PASS HF76: sessão autorizada mantém consumo/recovery de frames sem depender de uma única ponte de foreground; estabilidade e revogação permanecem protegidas.");
