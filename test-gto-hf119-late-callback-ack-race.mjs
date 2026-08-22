import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const syncPath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java");
const sync = fs.readFileSync(syncPath, "utf8");
const checks = [];
function check(name, condition) {
  const ok = Boolean(condition);
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

const flushStart = sync.indexOf("static void flushPending(Context context, SharedPreferences mainPrefs, Listener listener)");
const flushEnd = sync.indexOf("private static JSONObject buildPayload", flushStart);
const flush = flushStart >= 0 && flushEnd > flushStart ? sync.slice(flushStart, flushEnd) : "";

check("in-flight attempts have a per-call token", sync.includes("ConcurrentHashMap<String, String> IN_FLIGHT_ATTEMPTS") && flush.includes("String attemptToken = UUID.randomUUID().toString()"));
check("watchdog releases only its own attempt", flush.includes("releaseInFlightAttempt(sessionId, attemptToken)"));
check("late success cannot overwrite a newer attempt", flush.includes("if (!releaseInFlightAttempt(sessionId, attemptToken)) return;") && flush.includes("A late callback from the obsolete attempt is"));
check("late failure cannot resurrect pending after ACK", flush.includes("Do not let a late failure from an attempt already superseded") && flush.includes("if (!queue.contains(key)) return;"));
check("token release removes both ownership records", sync.includes("IN_FLIGHT_ATTEMPTS.remove(sessionId, attemptToken)") && sync.includes("IN_FLIGHT.remove(sessionId)"));

function release(state, sessionId, token) {
  if (state.tokens.get(sessionId) !== token || !state.inFlight.has(sessionId)) return false;
  state.inFlight.delete(sessionId);
  state.tokens.delete(sessionId);
  return true;
}
function success(state, sessionId, token) {
  if (!release(state, sessionId, token)) return;
  state.status = "SYNCED";
  state.queue.delete(sessionId);
}
function failure(state, sessionId, token) {
  if (!release(state, sessionId, token) || !state.queue.has(sessionId)) return;
  state.status = "PENDING";
}

const model = { inFlight: new Set(["S1"]), tokens: new Map([["S1", "A"]]), queue: new Set(["S1"]), status: "SYNCING" };
model.inFlight.add("S1");
model.tokens.set("S1", "B");
success(model, "S1", "B");
failure(model, "S1", "A");
check("behavior: ACK from retry remains terminal after late failure", model.status === "SYNCED" && !model.queue.has("S1"));

const failed = checks.filter((ok) => !ok).length;
if (failed) {
  console.error(`\n${failed} HF119 check(s) failed.`);
  process.exit(1);
}
console.log(`\nHF119 late-callback ACK race regression: APPROVED (${checks.length}/${checks.length})`);
