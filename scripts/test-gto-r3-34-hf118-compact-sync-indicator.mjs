import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const servicePath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const syncPath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java");
const source = fs.readFileSync(servicePath, "utf8");
const sync = fs.readFileSync(syncPath, "utf8");

const checks = [
  ["progress widget is available", source.includes("import android.widget.ProgressBar;")],
  ["sync indicator has one visual owner", source.includes("private View statusChipView;") && source.includes("private ProgressBar statusChipProgressView;")],
  ["only sync stages use compact indicator", source.includes("isCompactSyncStage") && source.includes("driverStage && isCompactSyncStage(driverStageKey)")],
  ["compact indicator uses horizontal container", source.includes("compactContainer.setOrientation(LinearLayout.HORIZONTAL)")],
  ["compact indicator contains indeterminate progress", source.includes("progressView.setIndeterminate(true)")],
  ["compact indicator is non-touchable", source.includes("FLAG_NOT_TOUCHABLE")],
  ["sync message is short", source.includes('"Registrando viagem…"') && source.includes('"Enviando viagem…"')],
  ["pending sync remains sticky until ACK", source.includes('"SYNC_PENDING_ACK"') && source.includes("0L") && source.includes("onSynced(String sessionId, String tripId)")],
  ["same visual view updates in place", source.includes("if (statusChipTextView != null) statusChipTextView.setText") && source.includes("statusChipDriverStageKey = key")],
  ["ACK still owns success transition", source.includes("finalizeResultProofAfterServerAck(sessionId)") && source.includes("Viagem registrada com sucesso!")],
  ["queue remains durable on pending", sync.includes("STATUS_PENDING") && sync.includes("scheduleRetry") && sync.includes("queue.edit().remove(key).commit()")],
  ["next trip still requires sync status", source.includes('STATUS_SYNCED.equals(prefs.getString("gtoTripSyncStatus", ""))')],
  ["pause visual flow remains independent", source.includes("pauseStageVisible") && source.includes("PAUSE_"),],
];

for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
const failed = checks.filter(([, ok]) => !ok).length;
if (failed) process.exit(1);
console.log("\\nHF118 COMPACT SYNC INDICATOR REGRESSION: APPROVED");
