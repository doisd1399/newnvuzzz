import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const build = read("android/app/build.gradle");

assert.ok(service.includes("hasLiveCaptureContinuity"), "continuidade real do transporte existe");
assert.ok(service.includes("keepObserverArmedDuringForegroundUncertainty"), "UsageStats stale não pausa permanentemente o observador");
assert.ok(service.includes('"LIVE_CAPTURE_CONTINUITY"'), "supervisor registra self-healing contínuo");
const continuityBlock = service.slice(service.indexOf("private void keepFrameAnalysisSessionActive"), service.indexOf("private boolean isDetectorSessionOperational"));
assert.ok(continuityBlock.includes("ACTIVE_SESSION_NO_FOREGROUND_INFERENCE"), "primeiro frame mantém a sessão ativa sem promover foreground");
assert.ok(!continuityBlock.includes("gtoForeground = true"), "self-healing não pode alterar o contexto visual");
assert.ok(!continuityBlock.includes("resumeScreenAnalysisInSameState"), "self-healing não pode alternar a análise por latch stale");
assert.ok(service.includes("captureStabilityGate"), "barreira de estabilidade permanece ativa");
assert.ok(service.includes("lastProjectionFrameAt"), "continuidade exige frame real recente");
assert.ok(service.includes("hasAuthorizedCaptureSession()"), "continuidade exige sessão de captura autorizada");
assert.ok(!service.includes("scheduleReturnForegroundOcr"), "não depende de OCR HUD");
assert.ok(!service.includes("GtoReturnForegroundPolicy"), "não depende de FPS/OCR visual");
assert.match(build, /versionCode 140/, "versionCode HF86");
assert.ok(build.includes('versionName "1.0.140"'), "versionName HF86");

console.log("PASS HF85: self-healing por continuidade de captura, retorno sem provas frágeis e estabilidade preservada.");
