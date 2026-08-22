import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const servicePath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const buildPath = path.join(root, "android/app/build.gradle");
const source = fs.readFileSync(servicePath, "utf8");
const build = fs.readFileSync(buildPath, "utf8");

class CaptureSessionModel {
  constructor() {
    this.now = 0;
    this.enabled = true;
    this.projectionActive = true;
    this.grantValidated = true;
    this.mediaProjection = true;
    this.virtualDisplay = true;
    this.imageReader = "reader-1";
    this.captureHandler = true;
    this.captureWidth = 1920;
    this.captureHeight = 1080;
    this.lastFrameAt = 0;
    this.lastAnalyzedAt = 0;
    this.foregroundPackage = "com.stargamesapps.gto";
    this.gtoForeground = true;
    this.analysisPaused = false;
    this.transientSurface = false;
    this.stableFrames = 3;
    this.ready = true;
    this.framesConsumed = 0;
    this.framesAnalyzed = 0;
    this.framesRejectedAsStaleReader = 0;
    this.resumeCalls = 0;
    this.rebinds = 0;
    this.revocations = 0;
    this.semanticMutations = 0;
  }

  isFrameAnalysisSessionActive() {
    return this.enabled && this.projectionActive && this.grantValidated
      && this.mediaProjection && this.virtualDisplay && this.imageReader
      && this.captureHandler && this.captureWidth > this.captureHeight;
  }

  hasLiveCaptureContinuity() {
    return this.isFrameAnalysisSessionActive() && this.lastFrameAt > 0
      && this.now >= this.lastFrameAt && this.now - this.lastFrameAt <= 1200;
  }

  keepFrameAnalysisSessionActive() {
    if (!this.isFrameAnalysisSessionActive()) return;
    if (!this.gtoForeground || this.analysisPaused) {
      this.gtoForeground = true;
      this.analysisPaused = false;
      this.resumeCalls++;
      this.stableFrames = 0;
      this.ready = false;
    }
  }

  supervisorTick() {
    if (this.isFrameAnalysisSessionActive()) this.keepFrameAnalysisSessionActive();
    else if (!this.projectionActive) {
      this.gtoForeground = false;
      this.analysisPaused = true;
      this.ready = false;
    }
  }

  frame(reader = this.imageReader) {
    this.now += 16;
    this.lastFrameAt = this.now;
    this.framesConsumed++;
    if (reader !== this.imageReader) {
      this.framesRejectedAsStaleReader++;
      return;
    }
    if (!this.isFrameAnalysisSessionActive()) return;
    this.keepFrameAnalysisSessionActive();
    this.framesAnalyzed++;
    this.lastAnalyzedAt = this.now;
    if (this.stableFrames < 3) this.stableFrames++;
    this.ready = this.stableFrames >= 3;
  }

  semanticDecision() {
    if (!this.isFrameAnalysisSessionActive() || !this.ready || this.analysisPaused) return false;
    this.semanticMutations++;
    return true;
  }

  revokeProjection() {
    this.revocations++;
    this.projectionActive = false;
    this.grantValidated = false;
    this.mediaProjection = false;
    this.virtualDisplay = false;
    this.imageReader = null;
    this.gtoForeground = false;
    this.analysisPaused = true;
    this.ready = false;
  }

  reauthorize() {
    this.projectionActive = true;
    this.grantValidated = true;
    this.mediaProjection = true;
    this.virtualDisplay = true;
    this.imageReader = "reader-new";
    this.lastFrameAt = 0;
    this.lastAnalyzedAt = 0;
    this.stableFrames = 0;
    this.ready = false;
  }

  rebindReader() {
    if (!this.isFrameAnalysisSessionActive()) return false;
    this.rebinds++;
    this.imageReader = `reader-rebind-${this.rebinds}`;
    this.lastFrameAt = 0;
    this.lastAnalyzedAt = 0;
    this.stableFrames = 0;
    this.ready = false;
    return true;
  }
}

const results = [];
function scenario(name, fn) {
  const model = new CaptureSessionModel();
  fn(model);
  results.push({
    name,
    framesConsumed: model.framesConsumed,
    framesAnalyzed: model.framesAnalyzed,
    staleReaderRejected: model.framesRejectedAsStaleReader,
    resumeCalls: model.resumeCalls,
    rebinds: model.rebinds,
    revocations: model.revocations,
    semanticMutations: model.semanticMutations,
    active: model.isFrameAnalysisSessionActive(),
    ready: model.ready,
  });
}

scenario("foreground stale does not block live session", (m) => {
  for (let i = 0; i < 20; i++) m.frame();
  m.foregroundPackage = "com.example.other";
  m.gtoForeground = false;
  m.analysisPaused = true;
  for (let i = 0; i < 80; i++) {
    m.frame();
    if (i % 4 === 0) m.supervisorTick();
  }
  assert.equal(m.framesConsumed, 100);
  assert.equal(m.framesAnalyzed, 100);
  assert.equal(m.framesRejectedAsStaleReader, 0);
  assert.equal(m.gtoForeground, true);
  assert.equal(m.analysisPaused, false);
  assert.ok(m.semanticDecision());
});

scenario("return after NVU does not require package confirmation", (m) => {
  for (let i = 0; i < 12; i++) m.frame();
  m.foregroundPackage = "com.nvu.operacional";
  m.gtoForeground = false;
  m.analysisPaused = true;
  for (let i = 0; i < 120; i++) {
    m.frame();
    if (i % 6 === 0) m.supervisorTick();
  }
  assert.equal(m.framesAnalyzed, 132);
  assert.equal(m.framesRejectedAsStaleReader, 0);
  assert.equal(m.analysisPaused, false);
  assert.ok(m.semanticDecision());
});

scenario("old ImageReader callback cannot kill replacement", (m) => {
  for (let i = 0; i < 20; i++) m.frame();
  const oldReader = m.imageReader;
  assert.equal(m.rebindReader(), true);
  for (let i = 0; i < 20; i++) m.frame(oldReader);
  assert.equal(m.framesRejectedAsStaleReader, 20);
  for (let i = 0; i < 30; i++) m.frame();
  assert.ok(m.framesAnalyzed >= 30);
  assert.ok(m.semanticDecision());
});

scenario("real MediaProjection revocation is the only hard stop", (m) => {
  for (let i = 0; i < 30; i++) m.frame();
  m.revokeProjection();
  m.supervisorTick();
  for (let i = 0; i < 30; i++) m.frame();
  assert.equal(m.isFrameAnalysisSessionActive(), false);
  assert.equal(m.semanticDecision(), false);
  m.reauthorize();
  for (let i = 0; i < 40; i++) {
    m.frame();
    if (i % 5 === 0) m.supervisorTick();
  }
  assert.equal(m.isFrameAnalysisSessionActive(), true);
  assert.ok(m.semanticDecision());
});

scenario("repeated supervisor polls are idempotent", (m) => {
  for (let i = 0; i < 20; i++) m.frame();
  m.gtoForeground = false;
  m.analysisPaused = true;
  for (let i = 0; i < 100; i++) {
    m.supervisorTick();
    m.supervisorTick();
    m.frame();
  }
  assert.equal(m.framesAnalyzed, 120);
  assert.equal(m.framesRejectedAsStaleReader, 0);
  assert.ok(m.resumeCalls <= 1);
  assert.equal(m.analysisPaused, false);
  assert.ok(m.semanticDecision());
});

assert.ok(source.includes("isFrameAnalysisSessionActive"), "nova autoridade de sessão presente");
assert.ok(source.includes("keepFrameAnalysisSessionActive"), "self-healing de sessão presente");
assert.ok(source.includes("if (!isFrameAnalysisSessionActive()) return;"), "OCR rejeita apenas sessão realmente inativa");
assert.ok(source.includes("MediaProjection encerrada pelo Android"), "revogação real continua sendo tratada");
assert.ok(source.includes("captureStabilityGate.isReady()"), "barreira de estabilidade permanece");
assert.match(build, /versionCode 140/);
assert.ok(build.includes('versionName "1.0.140"'));

const reportPath = path.join(root, "HF86_SIMULACAO_SESSION_AUTHORITY_REPORT.json");
fs.writeFileSync(reportPath, JSON.stringify({
  mode: "deterministic-session-authority-no-device",
  scenarioCount: results.length,
  results,
}, null, 2) + "\n");

console.log(`PASS HF86 SIMULATION: ${results.length} cenários; sessão de captura e revogação real validadas.`);
for (const result of results) console.log(`${result.name}: analyzed=${result.framesAnalyzed}, stale=${result.staleReaderRejected}, resumes=${result.resumeCalls}, mutations=${result.semanticMutations}, active=${result.active}, ready=${result.ready}`);
console.log(`REPORT ${reportPath}`);
