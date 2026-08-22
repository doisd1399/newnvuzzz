import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const service = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"), "utf8");
const policy = fs.readFileSync(path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoPauseScreenDetectionPolicy.java"), "utf8");
const build = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");

const lines = [
  "Voltar ao jogo",
  "Ajustes",
  "Cancelar frete",
  "Chamar Guincho",
  "Voltar ao menu",
];
const normalized = lines.map((line) => line.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
const categories = [
  normalized.some((line) => line.includes("voltar ao jogo") || line.includes("continuar") || line.includes("retomar")),
  normalized.some((line) => line.includes("ajustes") || line.includes("opcoes") || line.includes("configuracoes")),
  normalized.some((line) => line.includes("cancelar frete") || line.includes("chamar guincho") || line.includes("guincho")),
  normalized.some((line) => line.includes("voltar ao menu") || line.includes("sair para o menu")),
].filter(Boolean).length;
assert.ok(categories >= 2, "a tela reproduzida deve ter duas ou mais categorias de pause");
assert.ok(policy.includes('"ajustes"'), "ajustes é sinal de pause");
assert.ok(policy.includes('"cancelar frete"'), "cancelar frete é sinal de pause");
assert.ok(policy.includes('"chamar guincho"'), "chamar guincho é sinal de pause");
assert.ok(policy.includes('"voltar ao menu"'), "voltar ao menu é sinal de pause");
assert.ok(policy.includes("return categories >= 2"), "gate exige categorias independentes");

const pauseBranch = service.slice(service.indexOf("boolean pauseRecoveryFlow"), service.indexOf("long interval", service.indexOf("boolean pauseRecoveryFlow")));
assert.ok(pauseBranch.includes("fastVisualDetector.analyze"), "pause-first executa detector visual atual");
assert.ok(pauseBranch.includes("maybeAnnouncePausePrompt(image, now, currentFreightListVisible)"), "prompt/OCR pause é o primeiro ramo");
assert.ok(pauseBranch.includes("return;"), "CONFIRMING_FREIGHT elegível não cai no OCR/manual genérico");
assert.ok(service.includes("schedulePauseScreenOcrIfDue(image, now)"), "primeira releitura OCR é armada após detecção");
assert.ok(service.includes("PAUSE_SCREEN_CONFIRM_FRAMES"), "detecção exige confirmação de frames");
assert.ok(service.includes("PAUSE_OCR_MANUAL_FALLBACK_ATTEMPTS"), "manual só vem após falha controlada");
assert.match(build, /versionCode 140/, "versionCode HF86");

console.log("PASS HF79: tela pause real reconhecida e fluxo pause-first verificado.");
