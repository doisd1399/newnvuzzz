import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

assert.ok(service.includes("boolean visualListConfirmed = isVisualFreightContextConfirmed(now)"));
assert.ok(service.includes("boolean actionableList = semanticList || visualListConfirmed"));
assert.ok(service.includes('lastScreenState = actionableList\n                    ? "FREIGHT_LIST"'));
assert.ok(service.includes("persistFreightRuntimeStatus(\n                    lastScreenState, actionableList ? runtimeFreightCount : 0"));
assert.ok(service.includes("cacheFastFreightPanel(image, visualProof, now)"));
assert.ok(service.includes('persistFreightRuntimeStatus(\n                            "FREIGHT_LIST"'));
assert.ok(service.includes("STATE_WAITING_FREIGHT.equals(state) && isVisualFreightContextConfirmed(now)"));
assert.ok(service.includes('return count > 0\n                    ? "Lista de fretes detectada · " + count + " opções"'));
assert.match(build, /versionCode 152/);
assert.ok(build.includes('versionName "1.0.152"'));
console.log("PASS HF94: autoridade visual da lista, cache pré-READY, status correto e toque pós-retorno.");
