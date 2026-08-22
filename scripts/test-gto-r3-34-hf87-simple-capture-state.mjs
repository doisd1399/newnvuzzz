import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

for (const state of ["CAPTURE_STATE_CAPTURING", "CAPTURE_STATE_RECOVERING", "CAPTURE_STATE_STOPPED"]) {
  assert.ok(service.includes(state), `estado ${state} ausente`);
}
for (const token of [
  "isFrameAnalysisSessionActive",
  "setCaptureMachineState",
  "recordCaptureFrameHeartbeat",
  "markCaptureRecovering",
  "markCaptureStopped",
  "captureLastFrameAt",
  "captureLastAnalyzedAt",
  "captureReaderIdentity",
  "captureVirtualDisplayPresent",
  "MediaProjection encerrada pelo Android",
]) {
  assert.ok(service.includes(token), `diagnóstico/autoridade ausente: ${token}`);
}
assert.match(build, /versionCode 140/);
assert.ok(build.includes('versionName "1.0.140"'));
assert.ok(!service.includes("hasFreshGtoForegroundEvidence(now)\n            && captureGeometryMatchesCurrentDisplay(now)"), "foreground evidence ainda é gate de prontidão");
assert.ok(!service.includes("scheduleReturnForegroundOcr"), "OCR de retorno não pode ser autoridade");

const activeIndex = service.indexOf("private boolean isFrameAnalysisSessionActive()");
const readyIndex = service.indexOf("private boolean isCaptureReadyForAnalysis");
assert.ok(activeIndex >= 0 && readyIndex >= 0 && activeIndex < readyIndex, "autoridade de sessão deve existir antes da prontidão");

console.log("PASS HF87: máquina CAPTURING/RECOVERING/STOPPED, heartbeat e diagnóstico determinísticos presentes; foreground/FPS/OCR não são gate de prontidão.");
