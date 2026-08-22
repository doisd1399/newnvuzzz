import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const sync = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java"), "utf8");
const detector = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoFastVisualDetector.java"), "utf8");
const checks = [];
function check(name, condition) {
  const ok = Boolean(condition);
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

const frameStart = service.indexOf("if (fastPendingSelectedRow >= 0\n                    && fastPendingFromTouchPulse");
const frameEnd = service.indexOf("fastPreviousFreightFrame = current;", frameStart);
const frameBlock = frameStart >= 0 && frameEnd > frameStart ? service.slice(frameStart, frameEnd) : "";
const supervisorStart = sync.indexOf("private static void armPendingRetrySupervisor");
const supervisorEnd = sync.indexOf("private static boolean shouldPauseAutomaticRetry", supervisorStart);
const supervisorBlock = supervisorStart >= 0 && supervisorEnd > supervisorStart ? sync.slice(supervisorStart, supervisorEnd) : "";

check("exact touch source is recognized", service.includes("exact-outside-touch+frame-lock") && service.includes("hasExactTouchSelectionPending()") && service.includes("pendingSelectionTransaction.source"));
check("exact touch finalizes on first post-touch list frame", frameBlock.includes("hasExactTouchSelectionPending()") && frameBlock.includes("selectionCoordinator.isPostTouch(sequence)") && frameBlock.includes("finalizeFastVisualSelection();"));
check("normal confirmation path remains active", service.includes("runPreciseSelectedRowOcr(transaction);") && service.includes("persistSelectionIdentity(row, \"TOUCH_LOCKED\", transaction.source);") && service.includes("GtoAutoTripSync.lockSelectedFreight(this, prefs)"));
check("page navigation protection remains active", service.includes("pageDistance(fastTouchBaseline, current)") && service.includes("if (pageDistance >= 0.028f)") && service.includes("clearFastTouchPulse(false)"));
check("pending queue arms one supervisor", sync.includes("QUEUE_RETRY_SUPERVISOR_MS = 15_000L") && sync.includes("RETRY_SUPERVISOR_ARMED") && sync.includes("armPendingRetrySupervisor(context, mainPrefs, listener);") && supervisorBlock.includes("MAIN_HANDLER.postDelayed") && supervisorBlock.includes("flushPending(context, prefs, listener);"));
check("supervisor stops after queue removal and respects retryAt", supervisorBlock.includes("if (!hasQueued(context)) return;") && sync.includes("long retryAt = retry.getLong(RETRY_AT_PREFIX + sessionId, 0L);") && sync.includes("if (retryAt > now) continue;"));
check("temporary failure remains durable and retryable", sync.includes("Falha temporária; nova tentativa automática será feita.") && sync.includes("scheduleRetry(retry, sessionId, code);") && sync.includes("putString(\"gtoTripSyncStatus\", STATUS_PENDING)"));
check("next freight remains ACK-gated", service.includes("STATUS_SYNCED") && service.includes("canPrepareNextFreightFromSealedQueue()") && service.includes("tripId"));

const failed = checks.filter((ok) => !ok).length;
if (failed) {
  console.error(`\n${failed} HF116 check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} HF116 checks passed.`);
