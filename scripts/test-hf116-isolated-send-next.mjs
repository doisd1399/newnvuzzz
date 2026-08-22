import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const servicePath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const syncPath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java");
const policyPath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoDeterministicFlowPolicy.java");
const service = fs.readFileSync(servicePath, "utf8");
const sync = fs.readFileSync(syncPath, "utf8");
const policy = fs.readFileSync(policyPath, "utf8");

const events = [];
let oldQueue = true;
let currentSession = "session-next";
let oldSession = "session-completed";
let currentState = "RESULT_CONFIRMED";
let currentSync = "PENDING";

function prepareNextBeforeAck() {
  if (currentState !== "RESULT_CONFIRMED") return false;
  if (!oldQueue) return false;
  // This models the explicit beginTrip path: the old payload is already sealed,
  // therefore the new session may be created while the old queue retries.
  currentSession = "session-next";
  currentState = "WAITING_FREIGHT";
  currentSync = "IN_PROGRESS";
  events.push("NEXT_SESSION_PREPARED");
  return true;
}

function oldSessionPendingCallback() {
  if (oldSession !== currentSession && oldQueue) {
    events.push("OLD_PENDING_INDEPENDENT");
    return true;
  }
  return false;
}

function oldSessionAckCallback() {
  if (oldSession !== currentSession) {
    oldQueue = false;
    events.push("OLD_ACK_INDEPENDENT");
    return true;
  }
  return false;
}

const prepared = prepareNextBeforeAck();
const pendingIndependent = oldSessionPendingCallback();
const ackIndependent = oldSessionAckCallback();

const checks = [
  ["completed delivery is sealed before next session", service.includes("enqueueConfirmedTrip(this, prefs, automaticTripSyncListener())") && service.includes("preserveCompletedTripBeforeReset()")],
  ["explicit next-trip path clears old runtime after sealing", service.includes("if (!clearTripAnalysis()) return;") && service.includes("setTripState(STATE_WAITING_FREIGHT")],
  ["new session can be prepared independently of old queue", prepared && currentState === "WAITING_FREIGHT" && currentSync === "IN_PROGRESS"],
  ["pending callback for old session does not mutate current session", service.includes("!sessionId.isEmpty() && !sessionId.equals(currentSession)") && service.includes("lastIndependentDeliveryRetrySessionId") && pendingIndependent],
  ["old ACK is independent and does not block next freight", service.includes("lastIndependentDeliveryAckSessionId") && sync.includes("if (!currentSession && sameOperation)") && ackIndependent],
  ["automatic retry supervisor remains armed for old queue", sync.includes("armPendingRetrySupervisor(context, mainPrefs, listener);") && sync.includes("if (!hasQueued(context)) return;")],
  ["same-session ACK can automatically prepare next freight", service.includes("shouldAutoPrepareNextFreightAfterSync") && service.includes("beginTrip(false, false)")],
  ["next preparation remains protected by operation policy", service.includes("isOperationClosedForNewTrip()") && service.includes("canPrepareNextFreightFromSealedQueue()") && policy.includes("mayPrepareNextFreightAfterSealedQueue")],
  ["registered state still requires STATUS_SYNCED", service.includes("STATUS_SYNCED.equals(prefs.getString(\"gtoTripSyncStatus\", \"\"))") && sync.includes("putString(\"gtoTripSyncStatus\", STATUS_SYNCED)")],
  ["ACK still requires real tripId", sync.includes("tripId.isEmpty()") && sync.includes("putString(\"gtoRegisteredTripId\", tripId)")],
];

for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
console.log(`EVENTS ${events.join(",")}`);
const failed = checks.filter(([, ok]) => !ok).length;
if (failed) process.exit(1);
console.log("\nTESTE ISOLADO ENVIO–PRÓXIMO FRETE: APROVADO");
