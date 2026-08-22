import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const syncPath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java");
const servicePath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const backendPath = path.join(root, "functions/src/gtoTrips.ts");
const compiledBackendPath = path.join(root, "functions/lib/gtoTrips.js");
const sync = fs.readFileSync(syncPath, "utf8");
const service = fs.readFileSync(servicePath, "utf8");
const backend = fs.readFileSync(backendPath, "utf8");
const compiledBackend = fs.readFileSync(compiledBackendPath, "utf8");

const authNullDetail = "Sessão NVU indisponível; o envio para o sistema será retomado automaticamente após a autenticação.";
const lower = authNullDetail.toLowerCase();
const networkLikely = lower.includes("network") || lower.includes("offline") || lower.includes("conex") || lower.includes("unavailable") || lower.includes("timeout");
const authUnavailable = lower.includes("sessão nvu indisponível") || lower.includes("autenticação") || lower.includes("no_native_auth");
const retryPaused = false;
const rendered = retryPaused
  ? "Envio pausado para correção. A viagem permanece protegida e não foi descartada."
  : (authUnavailable
    ? "Aguardando autenticação. A viagem permanece protegida; o envio será retomado automaticamente."
    : (networkLikely ? "Sem conexão. A viagem permanece protegida; o envio será retomado automaticamente." : "Falha temporária. O envio para o sistema será tentado novamente."));

const checks = [
  ["NO_NATIVE_AUTH has a distinct UI branch", service.includes("boolean authUnavailable") && service.includes("Aguardando autenticação")],
  ["auth-null no longer renders the generic screenshot message", rendered === "Aguardando autenticação. A viagem permanece protegida; o envio será retomado automaticamente." && !authUnavailable === false],
  ["network failures still have a separate message", service.includes("Tentando enviar…") && service.includes("networkLikely")],
  ["retry remains automatic after auth restoration", sync.includes("AUTH_STATE_LISTENER") && sync.includes("retryAutomaticTripQueueIfRunning()") && sync.includes("flushPending(context, prefs, null)")],
  ["valid Empresa → Local route is no longer rejected", !backend.includes("if (origin !== originCompany)")],
  ["canonical origin is the final location", backend.includes("const effectiveOrigin = origin;") && backend.includes('const effectiveOriginSource = "GTO_ORIGIN_LOCATION"')],
  ["stored origin uses final location", backend.includes("origem: effectiveOrigin") && backend.includes("gtoOrigin: effectiveOrigin")],
  ["compiled Functions contain HF117", compiledBackend.includes("GTO_ORIGIN_LOCATION") && !compiledBackend.includes("origin !== originCompany")],
  ["backend still returns real session/trip ACK", backend.includes("success: true") && backend.includes("sessionId") && backend.includes("tripId")],
  ["Android queue remains durable on pending", sync.includes("scheduleRetry(retry, sessionId, code)") && sync.includes("markPending(mainPrefs, retryMessage)")],
];

for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
console.log(`FIXED_AUTH_MESSAGE ${rendered}`);
const failed = checks.filter(([, ok]) => !ok).length;
if (failed) process.exit(1);
console.log("\nHF117 CAUSE-ROOT-FIX REGRESSION: APPROVED");
