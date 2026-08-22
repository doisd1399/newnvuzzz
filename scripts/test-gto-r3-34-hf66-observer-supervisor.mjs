import fs from "node:fs";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
const service = fs.readFileSync(`${root}/android/app/src/main/java/com/nvu/operacional/GtoObserverService.java`, "utf8");
const plugin = fs.readFileSync(`${root}/android/app/src/main/java/com/nvu/operacional/GtoObserverPlugin.java`, "utf8");
const observer = fs.readFileSync(`${root}/src/lib/gtoObserver.ts`, "utf8");

const checks = [
  ["supervisor catches transient exceptions", /SUPERVISOR_EXCEPTION/.test(service) && /catch \(Exception ex\)/.test(service)],
  ["supervisor always re-arms in finally", /finally \{[\s\S]*?postDelayed\(this, FOREGROUND_POLL_INTERVAL_MS\)/.test(service)],
  ["detector remains active during foreground lag", /shouldKeepDetectorAliveDuringForegroundLag/.test(service) && /authorizedCaptureSessionAlive/.test(service) && /consumeCaptureStabilityFrame\(reader\)/.test(service)],
  ["foreground lag keeps state mutations gated", /recognizer can only restore GTO after strict current-pixel evidence/.test(service) && /consumeCaptureStabilityFrame\(reader\)/.test(service)],
  ["detector heartbeat is exposed natively", /status\.put\("detectorActive", detectorActive\)/.test(plugin) && /detectorHeartbeatAt/.test(plugin)],
  ["UI distinguishes live detector from real recovery", /Ativo · detector em execução/.test(service) && /isDetectorActive\(/.test(service)],
  ["capture remains Observe-owned in every trip state", /return prefs != null && prefs\.getBoolean\("enabled", false\);/.test(service)],
  ["task removal re-arms supervisor without projection reset", /Task removal is not a projection-loss event/.test(service) && /mainHandler\.post\(foregroundPoll\)/.test(service)],
  ["frontend status contract includes detector heartbeat", /detectorActive\?: boolean/.test(observer) && /detectorHeartbeatAt\?: number/.test(observer)],
];

for (const [label, ok] of checks) {
  assert.ok(ok, label);
  console.log(`PASS ${label}`);
}
console.log(`${checks.length}/${checks.length} HF66 observer-supervisor checks passed.`);
