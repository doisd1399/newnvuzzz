import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
const metadata = JSON.parse(fs.readFileSync(path.join(root, "NVU_RELEASE_METADATA.json"), "utf8"));

assert.match(build, /versionCode 152/);
assert.ok(build.includes('versionName "1.0.152"'));
assert.equal(metadata.functionalRelease, "R3.34-PC-HF102");
assert.equal(metadata.androidVersionCode, 152);
assert.equal(metadata.androidVersion, "1.0.152");

const reviewUi = service.slice(
  service.indexOf("Button save = menuButton(GtoFreightReviewPolicy.ORIGIN_COMPANY.equals(field)"),
  service.indexOf("if (!projectionActive", service.indexOf("Button save = menuButton(GtoFreightReviewPolicy.ORIGIN_COMPANY.equals(field)"))
);
assert.ok(reviewUi.includes("input.addTextChangedListener"));
assert.ok(reviewUi.includes("save.setEnabled(GtoFreightReviewPolicy.isManualValueValid"), "valor restaurado deve recalcular a validade do botão");
assert.ok(reviewUi.includes("input.getText() == null ? \"\" : input.getText().toString()"));
assert.ok(reviewUi.includes("applyManualFreightReviewField(field"));

const manual = service.slice(
  service.indexOf("private void applyManualFreightReviewField"),
  service.indexOf("private void commitReviewedFreight")
);
assert.ok(manual.includes('putString("reviewDestination", value)'));
assert.ok(manual.includes("firstReviewField(current)"));
assert.ok(manual.includes("commitReviewedFreight(current)"));

const commit = service.slice(
  service.indexOf("private void commitReviewedFreight"),
  service.indexOf("private void transitionConfirmedFreightToTripInProgress")
);
assert.ok(commit.includes("GtoAutoTripSync.lockSelectedFreight(this, prefs)"));
assert.ok(commit.includes("transitionConfirmedFreightToTripInProgress()"));
assert.ok(commit.includes('putString("selectionConfirmationStatus", "CONFIRMED")'));

const transition = service.slice(
  service.indexOf("private void transitionConfirmedFreightToTripInProgress"),
  service.indexOf("private void emitSystemReadyForDepartureIfEligible")
);
assert.ok(transition.includes("setTripState(STATE_TRIP_IN_PROGRESS"));
assert.ok(transition.includes("emitSystemReadyForDepartureIfEligible()"));

console.log("PASS HF101: draft restaurado habilita salvar; destino confirmado bloqueia snapshot e inicia a viagem.");
