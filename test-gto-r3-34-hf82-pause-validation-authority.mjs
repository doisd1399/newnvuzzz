import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const policy = read("android/app/src/main/java/com/nvu/operacional/GtoPauseScreenDetectionPolicy.java");
const parser = read("android/app/src/main/java/com/nvu/operacional/GtoPauseLocationParser.java");
const build = read("android/app/build.gradle");

const start = service.indexOf("private String validatePauseFreightAgainstCurrentReview");
const end = service.indexOf("private boolean samePauseField", start);
assert.ok(start >= 0 && end > start, "validação do pause existe");
const validation = service.slice(start, end);

assert.ok(validation.includes("HF82"), "causa raiz HF82 registrada no código");
assert.ok(validation.includes("pauseFieldHasManualConfirmation(GtoFreightReviewPolicy.CARGO)"), "Carga manual continua protegida");
assert.ok(validation.includes("pauseFieldHasManualConfirmation(GtoFreightReviewPolicy.ORIGIN_COMPANY)"), "Origem manual continua protegida");
assert.ok(validation.includes("pauseFieldHasManualConfirmation(GtoFreightReviewPolicy.DESTINATION)"), "Destino manual continua protegido");
assert.doesNotMatch(validation, /!pauseFieldIsPending\(GtoFreightReviewPolicy\.(CARGO|ORIGIN_COMPANY|DESTINATION)\)/, "OCR antigo não bloqueia a correção do pause");
assert.ok(service.includes('"MANUAL_DRIVER".equals(prefs.getString("reviewDestinationSource", ""))'), "fonte manual do Destino é distinguida");
assert.ok(service.includes('putString("selectedOrigin", freight.origin)'), "Origem corrigida é persistida");
assert.ok(service.includes('putString("selectedDestination", freight.destination)'), "Destino corrigido é persistido");
assert.ok(service.includes('putString("selectedCargo", freight.cargo)'), "Carga corrigida é persistida");
assert.ok(service.includes('transitionConfirmedFreightToTripInProgress()'), "a viagem é iniciada somente após o lock");
assert.ok(policy.includes("String remainder = original.substring"), "remainder bruto preserva separadores");
assert.ok(parser.includes("extractAfterLastSeparator"), "parser Empresa -> Local permanece seguro");
assert.match(build, /versionCode 140/, "versionCode HF86");
assert.ok(build.includes('versionName "1.0.140"'), "versionName HF86");

console.log("PASS HF82: leitura do pause substitui OCR antigo, protege entradas manuais e persiste os três campos antes da viagem.");
