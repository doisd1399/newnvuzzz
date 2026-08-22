import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const plugin = read("android/app/src/main/java/com/nvu/operacional/GtoObserverPlugin.java");
const health = read("android/app/src/main/java/com/nvu/operacional/GtoCaptureHealthPolicy.java");
const stability = read("android/app/src/main/java/com/nvu/operacional/GtoCaptureStabilityGate.java");
const observer = read("src/lib/gtoObserver.ts");

const updateStart = service.indexOf("private void updateCaptureHealthIndicator");
const updateEnd = service.indexOf("private void refreshTransientVisualContextAfterGtoReturn", updateStart);
const updateBody = service.slice(updateStart, updateEnd);
assert.ok(updateBody.includes("boolean rawHealthy = isDetectorSessionOperational(now)"), "bolinha deve usar o heartbeat real da sessão");
assert.ok(service.includes("return isDetectorSessionOperational(now);"), "detectorActive nativo deve usar a mesma autoridade de sessão");
assert.ok(service.includes("public static boolean isDetectorOperationalNow()"), "status deve consultar serviço vivo");
assert.ok(plugin.includes("GtoObserverService.isDetectorOperationalNow()"), "plugin deve usar a fonte nativa única");
assert.ok(plugin.includes("detectorProbeHeartbeatAt"), "heartbeat de sondagem deve ser separado");
assert.ok(plugin.includes('status.put("captureHealth"'), "status deve expor saúde real");
assert.ok(observer.includes("detectorProbeHeartbeatAt?: number"), "frontend deve distinguir sondagem");
assert.ok(observer.includes("captureHealth?:"), "frontend deve expor saúde da captura");
assert.ok(health.includes("lastFrameAt") && health.includes("lastAnalyzedAt"), "política legada mantém timestamps reais documentados");
assert.ok(service.includes("PROJECTION_STALE_FRAME_WATCHDOG_MS") && service.includes("PROJECTION_STALE_ANALYSIS_WATCHDOG_MS"), "heartbeat exige limites reais de frame e análise");
assert.ok(stability.includes("GTO_READY"), "retorno precisa atingir GTO_READY");
assert.ok(service.includes("captureStabilityGate.reset(") && service.includes("VISIBILITY_RETURN_3_FRAMES"), "retorno deve rearmar a barreira");
assert.ok(service.includes("consumeCaptureStabilityFrame(reader)"), "frames pós-retorno devem passar pela sonda de estabilidade");
assert.ok(service.includes("if (!isCaptureReadyForAnalysis(callbackAt))"), "detector decisório deve aguardar captura pronta");
assert.ok(service.includes("recordVisualGtoForegroundEvidence"), "lista visual pode recuperar foreground com evidência atual");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nvu-gto-health-"));
try {
  const run = spawnSync(
    "java",
    [
      "scripts/java-tests/JavaTestRunner.java",
      tmp,
      "com.nvu.operacional.GtoCaptureHealthPolicyTest",
      "android/app/src/main/java/com/nvu/operacional/GtoCaptureHealthPolicy.java",
      "scripts/java-tests/com/nvu/operacional/GtoCaptureHealthPolicyTest.java",
    ],
    { cwd: root, encoding: "utf8" },
  );
  const output = `${run.stdout || ""}\n${run.stderr || ""}`;
  assert.equal(run.status, 0, output);
  assert.match(output, /PASS GtoCaptureHealthPolicy/);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("PASS HF74: retorno ao GTO, saúde real do detector, bolinha e status sem falso positivo verificados.");
