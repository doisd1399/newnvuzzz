import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
const metadata = JSON.parse(fs.readFileSync(path.join(root, "NVU_RELEASE_METADATA.json"), "utf8"));

assert.match(build, /versionCode 152/);
assert.ok(build.includes('versionName "1.0.152"'));
assert.equal(metadata.functionalRelease, "R3.34-PC-HF102");
assert.equal(metadata.androidVersionCode, 152);
assert.equal(metadata.androidVersion, "1.0.152");

const pause = service.slice(
  service.indexOf("private void pauseScreenAnalysisOutsideGto"),
  service.indexOf("private void resumeScreenAnalysisInSameState")
);
assert.ok(pause.includes("armReturnSurfaceRefreshFromPause(screenAnalysisPausedAt)"), "refresh deve ser armado na saída, antes da prova visual de retorno");
assert.ok(service.includes("RETURN_SURFACE_REFRESH_DELAY_MS"), "refresh deve ter atraso curto para não rebindar no meio do evento de saída");

const resume = service.slice(
  service.indexOf("private void resumeScreenAnalysisInSameState"),
  service.indexOf("private void requestFreshProjectionSurfaceForGtoReturn")
);
assert.ok(resume.includes("boolean hadExplicitPause = pausedAt > 0L"));
assert.ok(resume.includes("requestFreshProjectionSurfaceForGtoReturn(System.currentTimeMillis(), pausedAt)"), "retorno real deve pedir refresh físico");
assert.ok(!resume.includes("requestFreshProjectionSurfaceForGtoReturn(System.currentTimeMillis())"), "refresh não deve ser disparado sem marcador do ciclo");

const refresh = service.slice(
  service.indexOf("private void requestFreshProjectionSurfaceForGtoReturn"),
  service.indexOf("private void ensureCaptureContinuityAfterGtoReturn")
);
assert.ok(refresh.includes("returnSurfaceRefreshPauseAt == safePauseMarker"), "o ciclo deve ser idempotente por pausa");
assert.ok(refresh.includes("beginCaptureRecoveryLease(now, \"GTO_RETURN_SURFACE_REFRESH\")"), "refresh deve usar lease exclusivo");
assert.ok(refresh.includes("rebindProjectionSurfaceWithoutReauthorization()"), "refresh deve reconectar a superfície existente");
assert.ok(refresh.includes("!captureIsNeededForCurrentState()"), "refresh não pode continuar com observador desabilitado");
assert.ok(!refresh.includes("requestProjectionPermission"), "refresh não pode pedir nova autorização");

const supervisor = service.slice(
  service.indexOf("private final Runnable foregroundPoll"),
  service.indexOf("private void scheduleForegroundPoll")
);
assert.ok(supervisor.includes("maybeForceReturnSurfaceRefresh(now)"), "supervisor deve concluir o refresh quando os recursos retornarem");

const onStop = service.slice(
  service.indexOf("public void onStop()"),
  service.indexOf("private void startProjection")
);
assert.ok(onStop.includes("returnSurfaceRefreshPending = false"), "onStop deve invalidar refresh de geração antiga");

console.log("PASS HF98: retorno real força refresh físico one-shot da superfície sem nova autorização.");
