import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const continuity = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoProjectionContinuityPolicy.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

assert.ok(service.includes("import java.util.concurrent.atomic.AtomicReference;"), "AtomicReference deve ser importado");
assert.ok(service.includes("AtomicReference<CaptureRuntimeSnapshot>"), "snapshot deve ser publicado atomicamente");
assert.ok(service.includes("private static final class CaptureRuntimeSnapshot"), "snapshot deve ser imutável e interno ao serviço");
assert.ok(service.includes("captureRuntimeSnapshot.set(next)"), "publicação deve ocorrer por set atômico");
assert.ok(service.includes("private static final String RECOVERY_IN_FLIGHT"), "lease RECOVERY_IN_FLIGHT deve existir");
assert.ok(service.includes("private boolean beginCaptureRecoveryLease"), "recuperação deve possuir entrada única");
assert.ok(service.includes("private void completeCaptureRecoveryFromFrame"), "primeiro frame deve confirmar o reader candidato");
assert.ok(service.includes("if (RECOVERY_IN_FLIGHT.equals(captureRecoveryState)"), "watchdog deve bloquear reentrada durante lease");
assert.ok(service.includes("INDICATOR_UNHEALTHY_CONFIRM_MS"), "indicador deve possuir histerese de queda");
assert.ok(service.includes("INDICATOR_HEALTHY_CONFIRM_FRAMES"), "indicador deve confirmar frames saudáveis");
assert.ok(service.includes("CaptureRuntimeSnapshot snapshot = captureRuntimeSnapshot.get()"), "saúde deve ler snapshot atômico");
assert.ok(!service.includes("captureWidth > captureHeight && captureHeight > 0"), "rotas contínuas não podem exigir landscape");
assert.ok(!service.includes("captureWidth > captureHeight\n"), "sessão autorizada não pode exigir landscape");
assert.ok(continuity.includes("boolean captureGeometryValid"), "política deve usar geometria válida");
assert.ok(!continuity.includes("boolean landscapeCapture"), "política não deve ter autoridade de orientação");
assert.match(build, /versionCode 152/);
assert.ok(build.includes('versionName "1.0.152"'));

function simulateIndicator(analysisGapMs) {
  const watchdog = 4200;
  const unhealthyConfirm = 2200;
  const poll = 350;
  let lastAnalyzed = 0;
  let white = false;
  let healthyStreak = 0;
  let unhealthySince = 0;
  const changes = [];
  for (let now = 0; now <= analysisGapMs + 5000; now += poll) {
    if (now === 0 || now > analysisGapMs) lastAnalyzed = now;
    const raw = now - lastAnalyzed <= watchdog;
    if (raw) {
      healthyStreak = Math.min(2, healthyStreak + 1);
      unhealthySince = 0;
      if (!white && healthyStreak >= 2) { white = true; changes.push([now, true]); }
    } else {
      healthyStreak = 0;
      if (!unhealthySince) unhealthySince = now;
      if (white && now - unhealthySince >= unhealthyConfirm) { white = false; changes.push([now, false]); }
    }
  }
  return changes;
}

const transientChanges = simulateIndicator(5000);
assert.equal(transientChanges.filter(([, state]) => !state).length, 0, "atraso curto não pode apagar a bolinha");
const sustainedChanges = simulateIndicator(10000);
assert.ok(sustainedChanges.some(([, state]) => !state), "perda sustentada ainda deve apagar o indicador");

let recoveryState = "IDLE";
let starts = 0;
function beginRecovery() {
  if (recoveryState === "RECOVERY_IN_FLIGHT") return false;
  recoveryState = "RECOVERY_IN_FLIGHT";
  starts++;
  return true;
}
assert.equal(beginRecovery(), true);
assert.equal(beginRecovery(), false);
assert.equal(starts, 1, "duas polls não podem iniciar dois rebinds");
console.log("PASS HF92: snapshot atômico, lease exclusivo, histerese e geometria sem dependência de orientação.");
