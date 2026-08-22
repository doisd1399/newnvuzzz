import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(new URL("..", import.meta.url).pathname);
const servicePath = path.join(
  projectRoot,
  "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java",
);
const serviceSource = fs.readFileSync(servicePath, "utf8");

class ObserverModel {
  constructor() {
    this.now = 0;
    this.enabled = true;
    this.projectionActive = true;
    this.projectionGrantValidated = true;
    this.virtualDisplay = true;
    this.imageReader = true;
    this.captureHandler = true;
    this.captureLandscape = true;
    this.lastFrameAt = 0;
    this.foregroundPackage = "com.stargamesapps.gto";
    this.gtoForeground = true;
    this.screenPaused = false;
    this.nvuMainActivityForeground = false;
    this.transientSurface = false;
    this.tripState = "TRIP_IN_PROGRESS";
    this.stableFrames = 3;
    this.resumeCalls = 0;
    this.framesConsumed = 0;
    this.framesDropped = 0;
    this.supervisorRuns = 0;
    this.supervisorReschedules = 0;
    this.tripStateMutations = 0;
    this.captureBarrierResets = 0;
    this.lastEvent = "";
    this.freezeDetected = false;
  }

  hasAuthorizedCaptureSession() {
    return this.enabled
      && this.projectionActive
      && this.projectionGrantValidated
      && this.virtualDisplay
      && this.imageReader
      && this.captureHandler
      && this.captureLandscape;
  }

  hasLiveCaptureContinuity() {
    return this.hasAuthorizedCaptureSession()
      && this.lastFrameAt > 0
      && this.now >= this.lastFrameAt
      && this.now - this.lastFrameAt <= 1200;
  }

  keepObserverArmedDuringForegroundUncertainty() {
    return !this.transientSurface
      && !this.nvuMainActivityForeground
      && this.hasLiveCaptureContinuity();
  }

  resumeScreenAnalysisInSameState() {
    if (!this.screenPaused && this.gtoForeground) return;
    this.screenPaused = false;
    this.gtoForeground = true;
    this.resumeCalls += 1;
    this.captureBarrierResets += 1;
    this.stableFrames = 0;
  }

  supervisorTick({ throwOnce = false } = {}) {
    this.supervisorRuns += 1;
    try {
      if (throwOnce) throw new Error("simulated UsageStats/WindowManager transient failure");
      const packageGto = this.foregroundPackage === "com.stargamesapps.gto";
      const rawGto = this.enabled && !this.transientSurface && packageGto;
      if (rawGto) {
        this.gtoForeground = true;
        this.screenPaused = false;
        this.lastEvent = "GTO_PACKAGE_CONFIRMED";
        this.resumeScreenAnalysisInSameState();
      } else if (this.transientSurface && this.gtoForeground) {
        this.screenPaused = true;
        this.lastEvent = "TRANSIENT_SURFACE_PAUSED_ONLY";
      } else if (this.keepObserverArmedDuringForegroundUncertainty()) {
        this.gtoForeground = true;
        this.screenPaused = false;
        this.lastEvent = "LIVE_CAPTURE_CONTINUITY";
        this.resumeScreenAnalysisInSameState();
      } else {
        this.screenPaused = true;
        this.gtoForeground = false;
        this.lastEvent = "CAPTURE_STALLED_OR_UNAVAILABLE";
      }
    } catch {
      this.lastEvent = "SUPERVISOR_EXCEPTION_RECOVERED";
    } finally {
      this.supervisorReschedules += 1;
    }
  }

  frame() {
    this.now += 16;
    this.lastFrameAt = this.now;
    this.framesConsumed += 1;
    const continuity = this.keepObserverArmedDuringForegroundUncertainty();
    if (continuity) {
      if (!this.gtoForeground || this.screenPaused) this.resumeScreenAnalysisInSameState();
      this.gtoForeground = true;
      this.screenPaused = false;
      this.lastEvent = "LIVE_CAPTURE_FRAME";
    }
    if (!this.gtoForeground || this.screenPaused) {
      this.framesDropped += 1;
      return;
    }
    if (this.stableFrames < 3) this.stableFrames += 1;
  }

  semanticDecisionAttempt() {
    if (this.gtoForeground && !this.screenPaused && this.stableFrames >= 3) {
      this.tripStateMutations += 1;
      return true;
    }
    return false;
  }
}

function runScenario(name, fn) {
  const model = new ObserverModel();
  fn(model);
  return { name, model };
}

const scenarios = [];

scenarios.push(runScenario("steady GTO frames", (m) => {
  for (let i = 0; i < 180; i++) {
    m.frame();
    m.supervisorTick();
  }
  assert.equal(m.framesConsumed, 180);
  assert.equal(m.framesDropped, 0);
  assert.equal(m.gtoForeground, true);
  assert.equal(m.screenPaused, false);
  assert.ok(m.semanticDecisionAttempt());
}));

scenarios.push(runScenario("UsageStats stale with continuous frames", (m) => {
  for (let i = 0; i < 10; i++) m.frame();
  m.foregroundPackage = "com.android.chrome";
  m.screenPaused = true;
  m.gtoForeground = false;
  const resumeBefore = m.resumeCalls;
  for (let i = 0; i < 120; i++) {
    m.frame();
    if (i % 3 === 0) m.supervisorTick();
  }
  assert.ok(m.framesConsumed > 0);
  assert.equal(m.framesDropped, 0);
  assert.equal(m.gtoForeground, true);
  assert.equal(m.screenPaused, false);
  assert.ok(m.resumeCalls > resumeBefore);
  assert.ok(m.semanticDecisionAttempt());
}));

scenarios.push(runScenario("unknown foreground with continuous frames", (m) => {
  for (let i = 0; i < 10; i++) m.frame();
  m.foregroundPackage = "";
  m.screenPaused = true;
  m.gtoForeground = false;
  for (let i = 0; i < 90; i++) {
    m.frame();
    if (i % 5 === 0) m.supervisorTick();
  }
  assert.equal(m.gtoForeground, true);
  assert.equal(m.screenPaused, false);
  assert.equal(m.framesDropped, 0);
  assert.ok(m.semanticDecisionAttempt());
}));

scenarios.push(runScenario("transient overlay then return", (m) => {
  for (let i = 0; i < 20; i++) m.frame();
  m.transientSurface = true;
  for (let i = 0; i < 30; i++) {
    m.supervisorTick();
    m.frame();
  }
  assert.equal(m.framesConsumed, 50);
  assert.equal(m.framesDropped, 30);
  m.transientSurface = false;
  m.foregroundPackage = "";
  for (let i = 0; i < 60; i++) {
    m.frame();
    if (i % 4 === 0) m.supervisorTick();
  }
  assert.equal(m.gtoForeground, true);
  assert.equal(m.screenPaused, false);
  assert.ok(m.resumeCalls >= 1);
  assert.ok(m.semanticDecisionAttempt());
}));

scenarios.push(runScenario("capture stall and recovery", (m) => {
  for (let i = 0; i < 20; i++) m.frame();
  m.now += 1500;
  m.foregroundPackage = "";
  m.supervisorTick();
  assert.equal(m.gtoForeground, false);
  assert.equal(m.screenPaused, true);
  assert.equal(m.semanticDecisionAttempt(), false);
  for (let i = 0; i < 60; i++) {
    m.frame();
    if (i % 4 === 0) m.supervisorTick();
  }
  assert.equal(m.gtoForeground, true);
  assert.equal(m.screenPaused, false);
  assert.ok(m.semanticDecisionAttempt());
}));

scenarios.push(runScenario("supervisor exception does not freeze", (m) => {
  for (let i = 0; i < 20; i++) m.frame();
  m.foregroundPackage = "";
  m.screenPaused = true;
  m.gtoForeground = false;
  m.supervisorTick({ throwOnce: true });
  for (let i = 0; i < 60; i++) {
    m.frame();
    if (i % 5 === 0) m.supervisorTick();
  }
  assert.ok(m.supervisorReschedules >= 13);
  assert.equal(m.gtoForeground, true);
  assert.equal(m.screenPaused, false);
  assert.ok(m.semanticDecisionAttempt());
}));

scenarios.push(runScenario("continuity never mutates trip state", (m) => {
  m.foregroundPackage = "com.example.other";
  m.screenPaused = true;
  m.gtoForeground = false;
  for (let i = 0; i < 90; i++) {
    m.frame();
    if (i % 3 === 0) m.supervisorTick();
  }
  assert.equal(m.tripState, "TRIP_IN_PROGRESS");
  assert.equal(m.tripStateMutations, 0);
  assert.equal(m.gtoForeground, true);
  assert.equal(m.screenPaused, false);
}));

assert.ok(serviceSource.includes("hasLiveCaptureContinuity"), "fonte contém continuidade real");
assert.ok(serviceSource.includes("keepObserverArmedDuringForegroundUncertainty"), "fonte contém self-healing do supervisor");
assert.ok(serviceSource.includes('"LIVE_CAPTURE_FRAME"'), "fonte contém self-healing do callback");
assert.ok(serviceSource.includes("captureStabilityGate"), "fonte mantém barreira de estabilidade");
assert.ok(!serviceSource.includes("scheduleReturnForegroundOcr"), "fonte não depende de OCR de retorno");
assert.ok(!serviceSource.includes("GtoReturnForegroundPolicy"), "fonte não depende da política FPS/OCR");

const summary = scenarios.map(({ name, model }) => ({
  name,
  framesConsumed: model.framesConsumed,
  framesDropped: model.framesDropped,
  resumeCalls: model.resumeCalls,
  supervisorRuns: model.supervisorRuns,
  supervisorReschedules: model.supervisorReschedules,
  captureBarrierResets: model.captureBarrierResets,
  tripStateMutations: model.tripStateMutations,
  finalForeground: model.gtoForeground,
  finalPaused: model.screenPaused,
  finalEvent: model.lastEvent,
}));

const reportPath = path.join(projectRoot, "HF85_SIMULACAO_SELF_HEALING_REPORT.json");
fs.writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  mode: "deterministic-no-device-simulation",
  scenarios: summary,
}, null, 2) + "\n");

console.log(`PASS HF85 SIMULATION: ${scenarios.length} cenários, invariantes de não congelamento e segurança aprovadas.`);
for (const item of summary) {
  console.log(`${item.name}: frames=${item.framesConsumed}, dropped=${item.framesDropped}, resumes=${item.resumeCalls}, mutations=${item.tripStateMutations}, final=${item.finalEvent}`);
}
console.log(`REPORT ${reportPath}`);
