import fs from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
const service = fs.readFileSync(`${root}/android/app/src/main/java/com/nvu/operacional/GtoObserverService.java`, "utf8");
const sync = fs.readFileSync(`${root}/android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java`, "utf8");
const backend = fs.readFileSync(`${root}/functions/src/gtoTrips.ts`, "utf8");

const checks = [
  ["native auth recovery is event-driven", /FirebaseAuth\.AuthStateListener/.test(sync) && /addAuthStateListener\(AUTH_STATE_LISTENER\)/.test(sync)],
  ["auth event flushes while service is alive", /retryAutomaticTripQueueIfRunning\(\)/.test(sync) && /flushAutomaticTripQueue\(\)/.test(service)],
  ["auth recovery also flushes without service", /if \(!GtoObserverService\.isRunning\(\)[\s\S]*?flushPending\(context, prefs, null\)/.test(sync)],
  ["missing native auth arms recovery instead of ending the flow", /if \(currentUser == null\) \{[\s\S]*?armAuthStateRecovery\(context, mainPrefs\)/.test(sync)],
  ["completed payload remains durable before direct callable", /queue\.edit\(\)\.putString\(QUEUE_PREFIX \+ sessionId, sealed\)\.commit\(\)/.test(sync) && /getHttpsCallable\("registerGtoTrip"\)/.test(sync)],
  ["queue is removed only after backend ACK", sync.indexOf("queue.edit().remove(key).commit()") > sync.indexOf("getHttpsCallable(\"registerGtoTrip\")") && /responseContract < CONTRACT_VERSION/.test(sync)],
  ["successful UI says registered in system", /Registrada no sistema ✓/.test(service) && /Viagem registrada com sucesso!/.test(service)],
  ["direct-send UI no longer claims background-only delivery", /Enviando para o sistema\.\.\./.test(service) && !/Viagem salva ✓ · enviando em segundo plano/.test(service)],
  ["temporary failures explain automatic retry without false success", /Falha temporária\. O envio para o sistema será tentado novamente\./.test(service)],
  ["backend remains idempotent by session and fingerprint", /existingTripSnapshot\.exists/.test(backend) && /existingFingerprint !== payloadFingerprint/.test(backend) && /transaction\.create\(tripRef/.test(backend)],
  ["backend accepts active or delayed jobs for direct registration", /normalized === "active" \|\| normalized === "delayed"/.test(backend)],
];

for (const [label, ok] of checks) {
  assert.ok(ok, label);
  console.log(`PASS ${label}`);
}
console.log(`${checks.length}/${checks.length} HF67 direct-trip-sync checks passed.`);
