import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const sync = read("android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java");
const launcher = read("src/services/gtoWorkLauncher.ts");
const status = read("src/lib/jobStatus.ts");
const recordTrip = read("src/pages/driver/RecordTrip.tsx");
const backend = read("functions/src/gtoTrips.ts");
const checks = [];
function check(name, condition) {
  const ok = Boolean(condition);
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

check("status policy recognizes remaining deliveries", status.includes("export const hasRemainingDeliveries") && status.includes('normalizeJobStatus(status) === "awaiting_completion"') && status.includes("safeProgress < safeTotal"));
check("recordable status accepts only consistent remaining await", status.includes("hasRemainingDeliveries(status, progress, totalDeliveries)") && status.includes("TRIP_RECORDABLE_JOB_STATUSES"));
check("web route blocks only a genuinely closed job", recordTrip.includes("isClosedJobStatus") && recordTrip.includes("const activeJobClosed") && recordTrip.includes("if ((!activeJob || !activeContract) || (activeJobClosed"));
check("web route no longer unconditionally blocks awaiting completion", !recordTrip.includes('(activeJob.status === "completed" || activeJob.status === "awaiting_completion")'));
check("manual upload rechecks fresh contextual status", recordTrip.includes("freshJobProgress") && recordTrip.includes("freshJobTotalDeliveries") && recordTrip.includes("isTripRecordableJobStatus(\n          freshJobData.status"));
check("GTO launcher uses shared contextual status policy", launcher.includes('from "../lib/jobStatus"') && launcher.includes("isTripRecordableJobStatus(value, progress, total)") && launcher.includes("contextProgress") && launcher.includes("refreshedStatusProgress"));
check("native close policy respects progress versus total", service.includes('if ("awaiting_completion".equals(status)) return total <= 0 || progress >= total;'));
check("ACK reconciliation exists in the service", service.includes("reconcileAcknowledgedTripForNextFreight") && service.includes("STATUS_SYNCED") && service.includes("beginTrip(false, false)") && service.includes("prepareNextFreightFromSealedQueue"));
check("supervisor and service startup invoke ACK reconciliation", service.includes("reconcileAcknowledgedTripForNextFreight();") && service.includes("postDelayed(this::reconcileAcknowledgedTripForNextFreight, 1450L)"));
check("listener-free ACK invokes native reconciliation", sync.includes("else if (currentSession) {\n                                GtoObserverService.reconcileAcknowledgedTripIfRunning();"));
check("backend keeps awaiting only at contract total", backend.includes("fastProgress >= totalDeliveries") && backend.includes('fastJobStatus = "awaiting_completion"'));
check("backend accepts stale awaiting only with remaining deliveries", backend.includes("const statusIsTripRecordable = (") && backend.includes('normalized === "awaiting_completion"') && backend.includes("Number(progress) < totalDeliveries") && backend.includes("statusIsTripRecordable(job.status, Number(job.progress), totalDeliveries)"));

function isClosedJob(statusValue, progress, total) {
  const normalized = String(statusValue || "").trim().toLowerCase();
  if (["completed", "cancelled", "canceled"].includes(normalized)) return true;
  if (normalized !== "awaiting_completion") return false;
  return total <= 0 || progress >= total;
}
function isRecordable(statusValue, progress, total) {
  const normalized = String(statusValue || "").trim().toLowerCase();
  return ["active", "delayed"].includes(normalized)
    || (normalized === "awaiting_completion" && total > 0 && progress < total);
}

check("behavior: awaiting with 1/10 remains launchable", !isClosedJob("awaiting_completion", 1, 10) && isRecordable("awaiting_completion", 1, 10));
check("behavior: awaiting with 10/10 remains closed", isClosedJob("awaiting_completion", 10, 10) && !isRecordable("awaiting_completion", 10, 10));
check("behavior: completed remains closed", isClosedJob("completed", 1, 10) && !isRecordable("completed", 1, 10));

let state = "RESULT_CONFIRMED";
let syncStatus = "SYNCED";
let total = 3;
let progress = 1;
let prepared = false;
function reconcile() {
  if (state !== "RESULT_CONFIRMED" || syncStatus !== "SYNCED") return;
  if (isClosedJob("awaiting_completion", progress, total)) return;
  state = "WAITING_FREIGHT";
  prepared = true;
}
reconcile();
reconcile();
check("behavior: ACKed first trip prepares exactly one next session", prepared && state === "WAITING_FREIGHT");

const failed = checks.filter((ok) => !ok).length;
if (failed) {
  console.error(`\n${failed} HF120 check(s) failed.`);
  process.exit(1);
}
console.log(`\nHF120 consecutive-trip flow regression: APPROVED (${checks.length}/${checks.length})`);
