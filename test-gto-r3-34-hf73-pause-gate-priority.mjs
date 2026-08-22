import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const build = read("android/app/build.gradle");
const raw = path.join(root, "android/app/src/main/res/raw/nvu_pause_alert_voice_pt_br.mp3");

assert.ok(fs.statSync(raw).size > 1024, "áudio do alerta de pause deve existir");
assert.ok(service.includes("hasCurrentSessionSelectionIdentityForPauseRecovery"), "gate deve exigir identidade da sessão atual");
assert.ok(service.includes("selectionIdentitySessionId"), "identidade deve ser vinculada à sessão GTO");
assert.ok(service.includes("identityAt >= sessionStartedAt"), "seleção anterior à nova sessão não pode ser usada");
assert.ok(service.includes("pauseManualFallbackAllowed"), "fallback manual deve ter gate próprio");
assert.ok(service.includes("PAUSE_OCR_MANUAL_FALLBACK_AFTER_MS"), "fallback deve esperar o OCR automático");
assert.ok(service.includes("PAUSE_OCR_MANUAL_FALLBACK_ATTEMPTS"), "fallback deve exigir várias tentativas");
assert.ok(service.includes("armPauseManualFallback"), "fallback manual deve ser armado explicitamente");
assert.ok(service.includes("PAUSE_MANUAL_FALLBACK"), "fallback manual deve ser informado somente após falha automática");
assert.ok(service.includes("relendo automaticamente"), "OCR automático deve ser priorizado antes do manual");
assert.ok(service.includes("Prioridade: abra o menu de pause"), "preenchimento manual deve ser bloqueado antes do pause");

const enterStart = service.indexOf("private void enterFreightReview");
const enterEnd = service.indexOf("private FreightOption freightReviewFromPrefs", enterStart);
assert.ok(enterStart >= 0 && enterEnd > enterStart, "fluxo de revisão deve existir");
const enter = service.slice(enterStart, enterEnd);
assert.ok(enter.includes("if (isPauseRecoveryField(required))"), "campos Carga/Origem/Destino devem priorizar pause");
assert.ok(enter.includes("pauseManualFallbackAllowed"), "revisão elegível deve armar prioridade do pause");
assert.ok(enter.includes("pauseReadStatus"), "revisão elegível deve preparar o estado de leitura do pause");
assert.ok(enter.indexOf("if (isPauseRecoveryField(required))") < enter.indexOf("FREIGHT_REVIEW_REQUIRED"), "manual não pode ser anunciado antes da prioridade pause");
assert.ok(!enter.includes("maybeAnnouncePausePrompt(null"), "revisão não pode disparar prompt sem frame real");

const clearStart = service.indexOf("private boolean clearTripAnalysis");
const clearEnd = service.indexOf("private void openOperationalPanel", clearStart);
const clear = service.slice(clearStart, clearEnd);
for (const key of ["driverStagePendingKey", "driverStagePendingDurationMs", "driverStagePendingAt", "pausePromptVisible", "pauseScreenDetected", "pauseReadStatus", "pauseMissingField"]) {
  assert.ok(clear.includes(`remove(\"${key}\")`), `reset deve remover ${key}`);
}

assert.ok(build.includes("versionCode 124"), "versionCode HF73");
assert.ok(build.includes('versionName "1.0.124"'), "versionName HF73");
console.log("PASS HF73: gate da seleção atual, prioridade do OCR no pause, fallback manual tardio e limpeza de estado verificados.");
