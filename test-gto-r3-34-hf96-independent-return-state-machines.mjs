import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const policy = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoDeterministicFlowPolicy.java"), "utf8");
const foreground = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoVisualForegroundPolicy.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

for (const file of [
  "android/app/src/main/java/com/nvu/operacional/GtoTransportStateMachine.java",
  "android/app/src/main/java/com/nvu/operacional/GtoGeometryStateMachine.java",
  "android/app/src/main/java/com/nvu/operacional/GtoActionStateMachine.java",
]) assert.ok(fs.existsSync(path.join(root, file)), `máquina ausente: ${file}`);

assert.ok(service.includes("boolean transportContinuity = keepObserverArmedDuringForegroundUncertainty(now)"));
assert.ok(service.includes("boolean gtoContextProof = rearmedFromAuthorizedReturn"));
assert.ok(service.includes("boolean freshGto = gtoContextProof"));
assert.ok(service.includes("visualContextStateMachine.resetForGeneration(projectionGeneration, returnNow)"));
assert.ok(service.includes("actionStateMachine.derive("));
assert.ok(service.includes("return currentContext && (captureStabilityGate.isReady()"));
assert.ok(policy.includes("mayUseCurrentSessionVisualFreightProof"));
assert.ok(foreground.includes("allowCurrentSessionFreightListProof"));
assert.match(build, /versionCode 152/);
assert.ok(build.includes('versionName "1.0.152"'));
console.log("PASS HF96: transporte independente, prova visual separada, reset lógico de contexto e ações por geração.");
