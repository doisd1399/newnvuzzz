import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const build = read("android/app/build.gradle");

assert.ok(service.includes("rearmGtoForegroundFromAuthorizedReturn"), "retorno possui rearmamento determinístico");
assert.ok(service.includes("requestImmediateForegroundRefresh"), "retorno força refresh imediato");
assert.ok(service.includes("refreshForegroundPackage()"), "refresh consulta o pacote foreground atual");
assert.ok(service.includes("GTO_PACKAGE.equals(foregroundPackage)"), "retorno exige pacote GTO identificado");
assert.ok(service.includes("projectionGrantValidated"), "retorno exige sessão MediaProjection validada");
assert.ok(!service.includes("scheduleReturnForegroundOcr"), "OCR HUD antigo não pode permanecer");
assert.ok(!service.includes("GtoReturnForegroundPolicy"), "política FPS/OCR antiga não pode permanecer");
assert.ok(service.includes("captureStabilityGate"), "decisão continua protegida pela barreira de estabilidade");
assert.match(build, /versionCode 140/, "versionCode HF86");
assert.ok(build.includes('versionName "1.0.140"'), "versionName HF86");

console.log("PASS HF83/HF84: retorno sem FPS/OCR e refresh determinístico do foreground verificados.");
