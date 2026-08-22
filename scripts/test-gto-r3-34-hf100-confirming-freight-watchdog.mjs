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

const commitGuard = service.slice(
  service.indexOf("private boolean isConfirmedSelectionCommitContext"),
  service.indexOf("private boolean isCurrentGtoActionContext")
);
assert.ok(commitGuard.includes("selectionIdentitySessionId"));
assert.ok(commitGuard.includes("selectionIdentityAt"));
assert.ok(commitGuard.includes("isCaptureTransportHealthy(now) || isDetectorSessionOperational(now)"));
assert.ok(commitGuard.includes("screenAnalysisPausedOutsideGto"));

const commit = service.slice(
  service.indexOf("private void commitPreciseFreight"),
  service.indexOf("private void clearUncommittedSelectedFreight")
);
assert.ok(commit.includes("isConfirmedSelectionCommitContext(commitNow)"), "commit deve aceitar contexto de seleção humana atual quando visual stale");
assert.ok(commit.includes("transitionConfirmedFreightToTripInProgress()"));

const watchdog = service.slice(
  service.indexOf("private void armFreightConfirmationWatchdog()"),
  service.indexOf("private boolean canonicalSyncCallbackIsCurrent")
);
assert.ok(watchdog.includes("FREIGHT_CONFIRMATION_WATCHDOG_RETRY_MS"));
assert.ok(watchdog.includes("FREIGHT_CONFIRMATION_MAX_STUCK_MS"));
assert.ok(watchdog.includes("armFreightConfirmationWatchdog(FREIGHT_CONFIRMATION_WATCHDOG_RETRY_MS)"), "contexto stale deve reagendar");
assert.ok(watchdog.includes("commitPreciseFreight(stable)"), "dados completos devem concluir a viagem");
assert.ok(watchdog.includes("enterFreightReview("), "dados incompletos devem cair em revisão");
assert.ok(watchdog.includes("restoreWaitingAfterSelectionFailure("), "identidade ausente deve voltar à lista");
assert.ok(!watchdog.includes("|| !isCurrentGtoActionContext(System.currentTimeMillis())) return"), "não pode existir retorno silencioso do watchdog");

assert.ok(plugin.includes('status.put("freightConfirmationStartedAt"'));
assert.ok(plugin.includes('status.put("selectionConfirmationStuckForMs"'));
assert.ok(plugin.includes('status.put("selectionCommitContextEligible"'));

console.log("PASS HF100: CONFIRMING_FREIGHT possui retry, limite e saída segura; nenhum watchdog retorna silenciosamente.");
