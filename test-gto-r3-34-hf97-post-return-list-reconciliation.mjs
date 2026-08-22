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

const signature = service.slice(
  service.indexOf("private String visualContextSignature"),
  service.indexOf("private void observeVisualContextFrame")
);
assert.ok(signature.includes("Math.round(button.left * 100f / frame.screenWidth)"), "contexto deve usar geometria normalizada");
assert.ok(!signature.includes("frame.panelSignature"), "contexto não pode exigir assinatura RGB exata do painel");
assert.ok(signature.includes("same freight list remained visible"), "causa da instabilidade deve permanecer documentada");

const ordered = service.slice(
  service.indexOf("private void onFreightFrameAvailable"),
  service.indexOf("private FreightOption buildSelectionTransaction")
);
assert.ok(ordered.includes("boolean geometryChanged = image.getWidth() != captureWidth"), "retorno deve detectar resize no frame atual");
assert.ok(ordered.includes("reconcileCaptureGeometryFromFrame(image, now)"), "frame atual deve reconciliar a geometria antes do descarte");
assert.ok(ordered.includes('"CURRENT_IMAGE_READER_FRAME_RESIZE"'), "resize do produtor deve ser diagnosticado");
assert.ok(!/if \(image\.getWidth\(\) != captureWidth \|\| image\.getHeight\(\) != captureHeight\) \{\s*return;/.test(ordered), "frame redimensionado não pode ser descartado silenciosamente");

assert.ok(ordered.includes("observeVisualContextFrame(image, current, now)"), "lista atual deve alimentar o contexto visual");
assert.ok(ordered.includes("boolean actionableList = semanticList || visualListConfirmed"), "lista visual confirmada deve ser operacional");
assert.ok(ordered.includes('lastScreenState = actionableList\n                    ? "FREIGHT_LIST"'), "estado operacional deve sair de FREIGHT_LIST_VISUAL");

console.log("PASS HF97: assinatura visual robusta e reconciliação do frame redimensionado no retorno ao GTO.");
