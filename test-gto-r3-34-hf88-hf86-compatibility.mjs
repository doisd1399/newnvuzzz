import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const continuity = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoProjectionContinuityPolicy.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

assert.ok(service.includes("bubbleGestureStartedOutsideGto = !gtoForeground"), "arraste HF86 deve depender do contexto de início do gesto");
assert.ok(service.includes("if (gtoForeground || windowManager == null || bubbleRemoveTargetView != null"), "alvo de remoção deve manter o gate HF86");
assert.ok(service.includes("if (gtoForeground || bubbleRemoveTargetView == null || bubbleRemoveTargetParams == null"), "drop de remoção deve manter o gate HF86");
assert.ok(service.includes("isFrameAnalysisSessionActive"), "transporte de captura deve permanecer independente do botão");
assert.ok(service.includes("consumeCaptureStabilityFrame(reader)"), "retorno deve continuar consumindo frames");
assert.ok(continuity.includes("HF63/HF88"), "política de retorno HF88 presente");
assert.ok(continuity.includes("strict freight-list signature"), "prova visual continua estrita");
const freightMethod = continuity.slice(continuity.indexOf("static boolean mayProbeFreightReturnDuringForegroundLag"), continuity.indexOf("static boolean mayProbeResultDuringForegroundLag"));
assert.ok(!freightMethod.includes("!nvuMainActivityForeground"), "latch NVU stale não pode congelar a prova visual estrita");
assert.match(build, /versionCode 140/);
assert.ok(build.includes('versionName "1.0.140"'));
console.log("PASS HF88: compatibilidade HF86 do arraste preservada; retorno usa prova visual estrita sem veto de latch NVU stale.");
