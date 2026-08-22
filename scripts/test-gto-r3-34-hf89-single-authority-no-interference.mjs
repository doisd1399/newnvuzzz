import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const gate = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoCaptureStabilityGate.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

assert.ok(gate.includes("boolean captureSessionActive"), "barreira deve depender da sessão ativa");
assert.ok(!gate.includes("boolean hasFreshGtoForegroundEvidence"), "foreground não pode ser autoridade de transporte");
assert.ok(gate.includes("phase = INACTIVE"), "sessão inativa deve ser o único bloqueio de transporte");
assert.ok(service.includes("boolean captureSessionActive = isFrameAnalysisSessionActive()"), "observer deve passar a sessão ativa à barreira");
assert.ok(service.includes("private boolean isDetectorSessionOperational"), "indicador deve usar heartbeat real");
assert.ok(service.includes("boolean rawHealthy = isDetectorSessionOperational(now)"), "bolinha não pode usar gtoForeground/estabilidade como autoridade");
const continuity = service.slice(service.indexOf("private void keepFrameAnalysisSessionActive"), service.indexOf("private boolean isDetectorSessionOperational"));
assert.ok(!continuity.includes("gtoForeground = true"), "self-healing não pode promover foreground");
assert.ok(!continuity.includes("resumeScreenAnalysisInSameState"), "self-healing não pode alternar contexto de análise");
assert.ok(service.includes("bubbleGestureStartedOutsideGto = !isCurrentBubbleGtoContext(now)"), "arraste externo deve manter o contrato determinístico");
assert.ok(service.includes("if (!bubbleGestureActive) disarmBubbleStopForCurrentGesture"), "bridge não pode cancelar gesto ativo");
assert.ok(service.includes("if (now - lastActiveTripVisualProbeAt >= ACTIVE_TRIP_VISUAL_PROBE_MS)"), "classificador deve rodar pela sessão, não pelo trip state");
assert.match(build, /versionCode 152/);
assert.ok(build.includes('versionName "1.0.152"'));
console.log("PASS HF89: autoridade única de sessão, indicador por heartbeat, classificador contínuo e arraste externo sem interferência.");
