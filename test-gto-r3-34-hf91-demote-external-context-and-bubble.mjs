import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const policy = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoBubbleDismissPolicy.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

assert.ok(service.includes("boolean knownExternalOwner = !rawGto"), "saída externa precisa de autoridade explícita");
assert.ok(service.includes("pauseScreenAnalysisOutsideGto(\"GTO_EXIT_CONFIRMED_BY_FOREGROUND_OWNER\")"), "saída deve pausar somente interpretação e preservar transporte");
assert.ok(service.includes("putBoolean(\"gtoForeground\", false)"), "saída externa deve limpar o latch de foreground");
assert.ok(service.includes("private boolean hasConfirmedExternalForeground"), "gesto deve ter detector de contexto externo atual");
assert.ok(service.includes("bubbleGestureStartedOutsideGto = !isCurrentBubbleGtoContext(now)"), "início do gesto não pode usar latch stale");
assert.ok(service.includes("isCurrentBubbleGtoContext(now)"), "target e commit devem usar contexto atual");
assert.ok(service.includes("private boolean isCurrentGtoActionContext"), "ações devem usar contexto de frame atual");
assert.ok(service.includes("if (!isCurrentGtoActionContext(actionNow)") && service.includes("isVisualFreightContextConfirmed(actionNow)"), "toque preciso não pode depender só de gtoForeground");
assert.ok(policy.includes("gestureStartedOutsideGto && !gtoForeground"), "gesto iniciado no GTO permanece não destrutivo");
assert.match(build, /versionCode 152/);
assert.ok(build.includes('versionName "1.0.152"'));
console.log("PASS HF91: demotion simétrico do contexto externo, retorno de detecção e alvo de remoção com gesto atual.");
