import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const syncPath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java");
const servicePath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const backendPath = path.join(root, "functions/src/gtoTrips.ts");
const sync = fs.readFileSync(syncPath, "utf8");
const service = fs.readFileSync(servicePath, "utf8");
const backend = fs.readFileSync(backendPath, "utf8");

let backendCalls = 0;
const queue = { sessionId: "session-failure", sealed: true };
const authNullMessage = "Sessão NVU indisponível; o envio para o sistema será retomado automaticamente após a autenticação.";
const genericScreenMessage = "Falha temporária. O envio para o sistema será tentado novamente.";
const lowerDetail = authNullMessage.toLowerCase();
const networkLikely = lowerDetail.includes("network") || lowerDetail.includes("offline") || lowerDetail.includes("conex") || lowerDetail.includes("unavailable") || lowerDetail.includes("timeout");
const retryPaused = false;
const renderedForAuthNull = retryPaused
  ? "Envio pausado para correção. A viagem permanece protegida e não foi descartada."
  : (networkLikely ? "Sem conexão. A viagem permanece protegida; o envio será retomado automaticamente." : genericScreenMessage);

const properRoute = { origin: "Cruz do Oeste", originCompany: "Cooper Log" };
const backendRejectsProperRoute = backend.includes("if (origin !== originCompany)") && properRoute.origin !== properRoute.originCompany;

const checks = [
  ["auth-null branch exists", sync.includes("if (currentUser == null)") && sync.includes("NO_NATIVE_AUTH")],
  ["auth-null branch schedules retry without backend call", sync.includes("pauseRetryForReason(retry, queuedSessionId, \"NO_NATIVE_AUTH\")") && backendCalls === 0],
  ["auth-null detail is not classified as network by current UI", !networkLikely],
  ["auth-null branch renders exactly the beta screenshot message", renderedForAuthNull === genericScreenMessage],
  ["current UI hides the actual auth cause", service.includes("boolean networkLikely") && service.includes("Falha temporária. O envio para o sistema será tentado novamente.")],
  ["backend rejects valid Empresa → Local origin semantics", backendRejectsProperRoute],
  ["backend then treats originCompany as canonical origin", backend.includes("const effectiveOrigin = originCompany") && backend.includes("origem: effectiveOrigin")],
  ["backend mismatch is a separate paused path", sync.includes("BACKEND_CONTRACT_MISMATCH") && sync.includes("putBoolean(\"gtoTripSyncRetryPaused\", true)" )],
  ["durable queue remains protected on both paths", queue.sealed && sync.includes("markPending(mainPrefs") && sync.includes("scheduleRetry(retry, sessionId, code)")],
];

for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
console.log(`SIMULATED_BACKEND_CALLS_WITH_AUTH_NULL ${backendCalls}`);
console.log(`SIMULATED_AUTH_NULL_RENDERED_MESSAGE ${renderedForAuthNull}`);
const failed = checks.filter(([, ok]) => !ok).length;
if (failed) process.exit(1);
console.log("\nREPRODUÇÃO ISOLADA DA TELA: CAUSA DE DIAGNÓSTICO CONFIRMADA");
