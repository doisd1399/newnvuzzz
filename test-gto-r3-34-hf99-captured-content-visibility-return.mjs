import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const plugin = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverPlugin.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
const metadata = JSON.parse(fs.readFileSync(path.join(root, "NVU_RELEASE_METADATA.json"), "utf8"));

assert.match(build, /versionCode 152/);
assert.ok(build.includes('versionName "1.0.152"'));
assert.equal(metadata.functionalRelease, "R3.34-PC-HF102");
assert.equal(metadata.androidVersionCode, 152);
assert.equal(metadata.androidVersion, "1.0.152");

const callback = service.slice(
  service.indexOf("public void onCapturedContentVisibilityChanged"),
  service.indexOf("public void onStop()")
);
assert.ok(callback.includes("boolean wasHidden = !capturedContentVisible"), "retorno deve distinguir invisível → visível");
assert.ok(callback.includes("pauseScreenAnalysisOutsideGto(\"CAPTURED_CONTENT_HIDDEN\")"), "saída deve preservar transporte e invalidar somente contexto");
assert.ok(callback.includes("requestFreshProjectionSurfaceForGtoReturn(now, pauseMarker)"), "retorno visível deve reidratar a superfície atual");
assert.ok(callback.includes("maybeForceReturnSurfaceRefresh(now)"), "callback deve acordar o rebind sem aguardar UsageStats");
assert.ok(callback.includes("if (!wasHidden) return"), "callback inicial visível não pode provocar loop de rebind");
assert.ok(!callback.includes("setTripState"), "visibilidade não pode mudar o estado da viagem sozinha");

assert.ok(service.includes("capturedContentReturnEpoch"), "epoch nativo de retorno deve ser persistido");
assert.ok(plugin.includes('status.put("capturedContentVisible"'), "visibilidade deve ser exposta no diagnóstico");
assert.ok(plugin.includes('status.put("returnSurfaceRefreshStatus"'), "estado do refresh deve ser exposto no diagnóstico");

console.log("PASS HF99: callback de visibilidade capturada integrado ao retorno sem autorização de mutações.");
