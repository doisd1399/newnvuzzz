import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const policy = read("android/app/src/main/java/com/nvu/operacional/GtoPauseScreenDetectionPolicy.java");
const parser = read("android/app/src/main/java/com/nvu/operacional/GtoPauseLocationParser.java");
const build = read("android/app/build.gradle");

const completeStart = service.indexOf("private FreightOption readPauseFreight(List<OcrLine> lines, List<String> plainLines)");
const completeEnd = service.indexOf("private String pauseTextField", completeStart);
assert.ok(completeStart >= 0 && completeEnd > completeStart, "readPauseFreight existe");
const complete = service.slice(completeStart, completeEnd);

const incompleteStart = service.indexOf("private FreightOption readPauseFreightWithoutCompleteness");
const incompleteEnd = service.indexOf("private String pauseFieldLabel", incompleteStart);
assert.ok(incompleteStart >= 0 && incompleteEnd > incompleteStart, "readPauseFreightWithoutCompleteness existe");
const incomplete = service.slice(incompleteStart, incompleteEnd);

for (const block of [complete, incomplete]) {
  assert.match(block, /freight\.cargo\s*=\s*pauseTextField\(lines, "carga"/, "Carga sempre é relida no pause");
  assert.match(block, /freight\.originCompany\s*=\s*pauseLocationTextField\(lines, "origem"/, "Origem sempre é relida no pause");
  assert.match(block, /freight\.destination\s*=\s*pauseLocationTextField\(lines, "destino"/, "Destino sempre é relido no pause");
  assert.doesNotMatch(block, /pauseFieldIsPending\(/, "leitura não depende de pendência antiga");
}

assert.ok(policy.includes("String original = raw.trim()"), "OCR preserva texto bruto");
assert.ok(policy.includes("String remainder = original.substring"), "remainder bruto é extraído antes da normalização");
assert.ok(parser.includes("extractAfterLastSeparator"), "parser seguro Empresa -> Local permanece ativo");
assert.ok(service.includes('putString("selectedCargo", freight.cargo)'), "Carga relida é persistida");
assert.ok(service.includes('putString("selectedOrigin", freight.origin)'), "Origem relida é persistida");
assert.ok(service.includes('putString("selectedDestination", freight.destination)'), "Destino relido é persistido");
assert.ok(service.includes('transitionConfirmedFreightToTripInProgress()'), "viagem só inicia após confirmação");
assert.ok(service.includes('"PAUSE_FREIGHT_VALIDATED"'), "sucesso do pause é anunciado antes de iniciar");
assert.match(build, /versionCode 140/, "versionCode HF86");
assert.ok(build.includes('versionName "1.0.140"'), "versionName HF86");

const tmp = fs.mkdtempSync("/tmp/nvu-hf81-policy-");
try {
  const run = spawnSync(
    "java",
    [
      "scripts/java-tests/JavaTestRunner.java",
      tmp,
      "com.nvu.operacional.GtoPauseScreenDetectionPolicyTest",
      "android/app/src/main/java/com/nvu/operacional/GtoPauseScreenDetectionPolicy.java",
      "android/app/src/main/java/com/nvu/operacional/GtoPauseLocationParser.java",
      "scripts/java-tests/com/nvu/operacional/GtoPauseScreenDetectionPolicyTest.java",
    ],
    { cwd: root, encoding: "utf8" },
  );
  const output = `${run.stdout || ""}\n${run.stderr || ""}`;
  assert.equal(run.status, 0, output);
  assert.match(output, /PASS GtoPauseScreenDetectionPolicy/);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("PASS HF81: Carga, Origem e Destino são obrigatoriamente relidos no pause, preservados e aplicados antes da viagem.");
