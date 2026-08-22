import assert from "node:assert/strict";

const FRAME_WATCHDOG = 3200;
const ANALYSIS_WATCHDOG = 4200;
const RECOVERY_COOLDOWN = 1200;
const REQUIRED_STABLE_FRAMES = 3;
const SETTLE_MS = 280;

function transportHealthy(now, frameAt, analyzedAt) {
  return frameAt > 0 && analyzedAt > 0 && now - frameAt <= FRAME_WATCHDOG && now - analyzedAt <= ANALYSIS_WATCHDOG;
}

function shouldRecoverSurface(now, frameAt, analyzedAt, startedAt, lastRecoveryAt, gtoForeground, analysisPaused) {
  const frameReference = frameAt > 0 ? frameAt : Math.max(startedAt, lastRecoveryAt);
  const analysisReference = analyzedAt > 0 ? analyzedAt : Math.max(startedAt, lastRecoveryAt);
  const frameStalled = frameReference > 0 && now - frameReference >= FRAME_WATCHDOG;
  const analysisStalled = gtoForeground && !analysisPaused && analysisReference > 0 && now - analysisReference >= ANALYSIS_WATCHDOG;
  return (frameStalled || analysisStalled) && (lastRecoveryAt <= 0 || now - lastRecoveryAt >= RECOVERY_COOLDOWN);
}

function run() {
  let frameAt = 1000;
  let analyzedAt = 1000;
  let lastRecoveryAt = 0;
  let healthyEdges = [];
  let rebinds = 0;
  let stableFrames = 3;
  let gateReady = true;
  let generation = 1;

  for (let now = 1000; now <= 24000; now += 350) {
    // The physical source keeps delivering frames, but the synchronous visual pass
    // is deliberately unavailable for 5 seconds, reproducing the runtime condition
    // that makes the analyzed heartbeat stale while the projection still exists.
    frameAt = now;
    const analysisBlocked = now >= 4000 && now < 9000 || now >= 14500 && now < 19500;
    if (!analysisBlocked) analyzedAt = now;

    const healthy = transportHealthy(now, frameAt, analyzedAt);
    if (healthyEdges.length === 0 || healthyEdges.at(-1).value !== healthy) {
      healthyEdges.push({ now, value: healthy });
    }

    if (shouldRecoverSurface(now, frameAt, analyzedAt, 1000, lastRecoveryAt, true, false)) {
      rebinds++;
      lastRecoveryAt = now;
      generation++;
      gateReady = false;
      stableFrames = 0;
      // This is the implementation's exact reset behavior in repair/rebind paths.
      frameAt = 0;
      analyzedAt = 0;
    }

    if (!gateReady && frameAt > 0) {
      stableFrames++;
      if (stableFrames >= REQUIRED_STABLE_FRAMES && now - lastRecoveryAt >= SETTLE_MS) gateReady = true;
    }
  }

  assert.ok(rebinds >= 2, `esperava rebinds repetidos, obtido ${rebinds}`);
  assert.ok(healthyEdges.some((edge) => edge.value === false), "a saúde deve cair quando o analisado fica stale");
  assert.ok(healthyEdges.some((edge) => edge.value === true), "a saúde deve voltar quando a análise retorna");
  assert.ok(generation > 1, "a geração deve mudar após cada rebind");
  console.log(JSON.stringify({
    pass: true,
    rebinds,
    healthEdges: healthyEdges,
    finding: "o contrato atual permite alternância NOT_HEALTHY → HEALTHY_REAL_DETECTOR sempre que a análise ultrapassa 4200 ms; o rebind zera ambos os timestamps e reinicia a barreira"
  }, null, 2));
}

run();
