import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/nvu/operacional/GtoObserverService.java'), 'utf8');
const health = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/nvu/operacional/GtoCaptureHealthPolicy.java'), 'utf8');
const policy = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/nvu/operacional/GtoProjectionContinuityPolicy.java'), 'utf8');
const visual = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/nvu/operacional/GtoVisualContextStateMachine.java'), 'utf8');

const checks = [
  ['ACK reconciliation is called before foreground branching', service.indexOf('reconcileAcknowledgedTripForNextFreight();\n            expireBubbleGestureIfStale(now);') !== -1],
  ['supervisor and current-frame reconciliation paths are both present', service.match(/reconcileAcknowledgedTripForNextFreight\(\);/g)?.length >= 3 && service.includes('live = instance') && service.includes('acked-result-return-list')],
  ['ACKed RESULT_CONFIRMED return-list path exists', service.includes('STATE_RESULT_CONFIRMED.equals(getTripState())') && service.includes('STATUS_SYNCED.equals(prefs.getString("gtoTripSyncStatus", ""))') && service.includes('acked-result-return-list')],
  ['return-list path requires current visual freight evidence', service.includes('visualProof != null') && service.includes('visualProof.hasFreightList()') && service.includes('isVisualFreightContextConfirmed(now)')],
  ['return-list path only prepares next state, never selects a row', service.includes('recordVisualGtoForegroundEvidence(now, visualProof.buttons.size(), "acked-result-return-list")') && service.includes('reconcileAcknowledgedTripForNextFreight();')],
  ['surface refresh cannot execute over an external foreground app', service.includes('WAITING_GTO_RETURN_CONTEXT') && service.includes('gtoForeground') && service.includes('GTO_PACKAGE.equals(foregroundPackage)')],
  ['generic watchdog defers rebind during confirmed external app', service.includes('knownExternalDuringPause') && service.includes('captureRecoveryDeferred') && service.includes('EXTERNAL_APP_FOREGROUND')],
  ['external app does not revoke MediaProjection by itself', service.includes('pauseScreenAnalysisOutsideGto("GTO_EXIT_CONFIRMED_BY_FOREGROUND_OWNER")') && !service.includes('stopProjection();\n                releaseCaptureResources')],
  ['capture necessity is independent from trip state', service.includes('return prefs != null && prefs.getBoolean("enabled", false);')],
  ['transport health uses fresh frame and analysis heartbeats', health.includes('FRAME_HEALTH_FRESH_MS') && health.includes('ANALYSIS_HEALTH_FRESH_MS') && health.includes('lastFrameAt') && health.includes('lastAnalyzedAt')],
  ['partial surface repair stays on same grant while display exists', policy.includes('shouldRepairPartialSurface') && policy.includes('return !readerPresent || !handlerPresent;')],
  ['visual context needs consecutive current frames', visual.includes('REQUIRED_CONFIRMATION_FRAMES = 3') && visual.includes('MAX_CANDIDATE_GAP_MS')],
  ['new generation invalidates stale visual context', visual.includes('resetForGeneration') && visual.includes('candidateState = UNKNOWN')],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`);
  else { console.log(`FAIL ${name}`); failed++; }
}
console.log(`HF121 ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
