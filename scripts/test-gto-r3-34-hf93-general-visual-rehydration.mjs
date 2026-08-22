import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const machine = read("android/app/src/main/java/com/nvu/operacional/GtoVisualContextStateMachine.java");
const plugin = read("android/app/src/main/java/com/nvu/operacional/GtoObserverPlugin.java");
const build = read("android/app/build.gradle");

for (const state of ["FREIGHT_LIST", "PAUSE", "ACTIVE_TRIP", "RESULT"]) {
  assert.ok(machine.includes(`static final String ${state}`), `${state} deve possuir estado explícito`);
}
assert.ok(machine.includes("REQUIRED_CONFIRMATION_FRAMES = 3"));
assert.ok(machine.includes("observedGeneration"));
assert.ok(machine.includes("MAX_CANDIDATE_GAP_MS"));
assert.ok(service.includes("GtoVisualContextStateMachine visualContextStateMachine"));
assert.ok(service.includes("observeVisualContextFrame(image, visualProof, now)"));
assert.ok(service.includes("observeVisualContextFrame(image, current, now)"));
assert.ok(service.includes("observeVisualContextFrame(image, continuousVisualFrame, now)"));
assert.ok(service.includes("observePauseVisualContext(plainLines, now)"));
assert.ok(service.includes("rehydrateVisualContext(observed, now)"));
assert.ok(service.includes("visualContextGeneration == projectionGeneration"));
assert.ok(service.includes("visualContextActionsArmed"));
assert.ok(service.includes("!(selectionArmed && isVisualFreightContextConfirmed(actionNow))"));
assert.ok(plugin.includes('status.put("visualContextState"'));
assert.ok(plugin.includes('status.put("visualContextActionsArmed"'));
assert.match(build, /versionCode 152/);
assert.ok(build.includes('versionName "1.0.152"'));
console.log("PASS HF93: reidratação generalizada de lista, pause, viagem ativa e conclusão por geração atual.");
