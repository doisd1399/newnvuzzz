import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/nvu/operacional/GtoObserverService.java'), 'utf8');
const visual = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/nvu/operacional/GtoVisualContextStateMachine.java'), 'utf8');
const detector = fs.readFileSync(path.join(root, 'android/app/src/main/java/com/nvu/operacional/GtoFastVisualDetector.java'), 'utf8');
const tests = [
  ['context signature uses resolution and row count', service.includes('|rows=') && service.includes('screenWidth + "x" + frame.screenHeight')],
  ['context signature no longer hashes exact button coordinates', !service.includes("Math.round(button.left * 100f / frame.screenWidth)")],
  ['context reducer still requires three consecutive frames', visual.includes('REQUIRED_CONFIRMATION_FRAMES = 3') && visual.includes('consecutiveFrames >= REQUIRED_CONFIRMATION_FRAMES')],
  ['context reducer still invalidates stale capture generations', visual.includes('generation != observedGeneration') && visual.includes('candidateState = UNKNOWN')],
  ['page identity remains protected by panel signature', service.includes('samePage') && service.includes('panelSignature')],
  ['selection still requires exact press candidate', detector.includes('detectPressedRow') && detector.includes('detectPressedRowAfterTouch')],
  ['semantic list evidence remains separate from coarse context', service.includes('isFreightPageSemanticallyCertified') && service.includes('ensureLiveFreightSemanticCertification')],
  ['return path requires current freight visual evidence', service.includes('acked-result-return-list') && service.includes('visualProof.hasFreightList()')],
  ['return path does not inject touch', service.includes('reconcileAcknowledgedTripForNextFreight();') && !service.includes('injectInputEvent')],
  ['capture transport remains independent from foreground owner', service.includes('isFrameAnalysisSessionActive') && service.includes('projectionGrantValidated()')],
  ['external-app rebind deferral remains active', service.includes('knownExternalDuringPause') && service.includes('EXTERNAL_APP_FOREGROUND')],
  ['visual context actions still require current generation', service.includes('visualContextGeneration == projectionGeneration') && service.includes('visualContextActionsArmed')],
];
let failed = 0;
for (const [name, ok] of tests) {
  if (ok) console.log(`PASS ${name}`);
  else { console.log(`FAIL ${name}`); failed++; }
}
console.log(`HF122 ${tests.length - failed}/${tests.length}`);
if (failed) process.exit(1);
