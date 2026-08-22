import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const syncPath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java");
const servicePath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const sync = fs.readFileSync(syncPath, "utf8");
const service = fs.readFileSync(servicePath, "utf8");

const queue = new Map([["trip-session-2", { sealed: true }]]);
const retry = { retryAt: 15_000, attempt: 1 };
let now = 0;
let calls = 0;
let ack = false;

function supervisorTick() {
  if (!queue.size) return;
  if (retry.retryAt > now) return;
  calls += 1;
  if (calls === 1) {
    retry.attempt += 1;
    retry.retryAt = now + 30_000;
    return;
  }
  ack = true;
  queue.clear();
}

now = 15_000;
supervisorTick();
const preservedAfterFailure = queue.size === 1 && calls === 1 && !ack;
now = 45_000;
supervisorTick();
const removedOnlyAfterAck = queue.size === 0 && ack && calls === 2;

const checks = [
  ["código arma supervisor único", sync.includes("RETRY_SUPERVISOR_ARMED") && sync.includes("armPendingRetrySupervisor(context, mainPrefs, listener);")],
  ["supervisor usa timer periódico", sync.includes("QUEUE_RETRY_SUPERVISOR_MS = 15_000L") && sync.includes("MAIN_HANDLER.postDelayed")],
  ["supervisor chama novo flush", sync.includes("flushPending(context, prefs, listener);")],
  ["retry respeita retry_at", sync.includes("if (retryAt > now) continue;")],
  ["falha preserva fila na simulação", preservedAfterFailure],
  ["ACK remove fila somente após sucesso na simulação", removedOnlyAfterAck],
  ["callback mantém estado PENDING", sync.includes("putString(\"gtoTripSyncStatus\", STATUS_PENDING)")],
  ["próximo frete continua condicionado a STATUS_SYNCED", service.includes("STATUS_SYNCED") && service.includes("canPrepareNextFreightFromSealedQueue()")],
  ["ACK exige tripId", sync.includes("tripId.isEmpty()") && sync.includes("putString(\"gtoRegisteredTripId\", tripId)")],
];

for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
const failed = checks.filter(([, ok]) => !ok).length;
if (failed) process.exit(1);
console.log("\nTESTE ISOLADO DE RETRY: APROVADO");
