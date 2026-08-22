import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"),
  "utf8",
);
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

function includes(value, label) {
  assert.ok(service.includes(value), `${label}: esperado ${JSON.stringify(value)}`);
}

includes("private boolean isPauseRecoveryEligible()", "predicado de elegibilidade do pause");
includes("STATE_CONFIRMING_FREIGHT.equals(getTripState())", "revisão de frete selecionado");
includes("hasConfirmedSelectionIdentity()", "identidade humana confirmada");
includes("isFreightReviewPending()", "falha de revisão persistida");
includes("GtoFreightReviewPolicy.CARGO.equals(field)", "carga como campo crítico");
includes("GtoFreightReviewPolicy.ORIGIN_COMPANY.equals(field)", "origem como campo crítico");
includes("GtoFreightReviewPolicy.DESTINATION.equals(field)", "destino como campo crítico");
includes("boolean pauseRecoveryEligible = isPauseRecoveryEligible();", "gate no callback de captura");
includes("!STATE_WAITING_FREIGHT.equals(getTripState()) && !pauseRecoveryEligible", "espera normal não dispara pause");
includes("maybeAnnouncePausePrompt(image, now, pauseRecoveryEligible ? false : hasList);", "alerta sem fallback na espera normal");
includes("if (pauseRecoveryEligible) return;", "revisão não entra no pipeline de lista");
includes("!isPauseRecoveryEligible()) return;", "OCR protegido pelo gate");
includes("⚠️ Abra o menu do simulador para confirmar os dados do frete.", "texto do alerta preservado");

const promptMethod = service.slice(
  service.indexOf("private void maybeAnnouncePausePrompt"),
  service.indexOf("private void clearPauseReadState", service.indexOf("private void maybeAnnouncePausePrompt")),
);
assert.ok(!promptMethod.includes("if (!STATE_WAITING_FREIGHT.equals(getTripState())) return;"), "alerta não pode usar WAITING_FREIGHT como único gatilho");
assert.ok(!service.includes("STATE_WAITING_FREIGHT.equals(getTripState())) {\n            if (pausePromptVisible"), "não pode haver prompt automático na espera sem seleção");
assert.match(build, /versionCode 140/, "versionCode HF86");
assert.ok(build.includes('versionName "1.0.140"'), "versionName HF86");

console.log("PASS HF70: alerta de pause condicionado a frete selecionado e Carga/Origem/Destino pendentes.");
