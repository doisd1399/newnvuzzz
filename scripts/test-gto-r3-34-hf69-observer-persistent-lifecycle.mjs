import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const lifecycle = read("android/app/src/main/java/com/nvu/operacional/GtoObserverLifecyclePolicy.java");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const main = read("android/app/src/main/java/com/nvu/operacional/MainActivity.java");
const plugin = read("android/app/src/main/java/com/nvu/operacional/GtoObserverPlugin.java");
const setup = read("src/components/GtoObserverSetup.tsx");
const types = read("src/lib/gtoObserver.ts");
const build = read("android/app/build.gradle");

function includes(source, value, label) {
  assert.ok(source.includes(value), `${label}: esperado ${JSON.stringify(value)}`);
}

includes(manifest, 'android:stopWithTask="false"', "serviço fora do ciclo da tarefa");
includes(service, "return START_STICKY;", "serviço sticky");
includes(service, "public void onTaskRemoved(Intent rootIntent)", "callback de remoção da tarefa");
includes(service, "observador GTO e dados da viagem permanecem preservados", "preservação em remoção da tarefa");
const taskRemovedStart = service.indexOf("public void onTaskRemoved(Intent rootIntent)");
const taskRemovedEnd = service.indexOf("public void onDestroy()", taskRemovedStart);
const taskRemovedBlock = service.slice(taskRemovedStart, taskRemovedEnd);
assert.ok(!taskRemovedBlock.includes("stopSelf()"), "onTaskRemoved não pode parar o serviço");
assert.ok(!taskRemovedBlock.includes("stopProjection()"), "onTaskRemoved não pode desmontar a captura");

includes(service, "private void updateObserverLifecycleStatus(long now)", "status independente do GTO");
includes(service, "observerLifecycleActive", "heartbeat do ciclo do Observador");
includes(service, "observerLifecycleStatus", "estado de ciclo do Observador");
includes(service, "gtoCaptureReady", "prontidão separada da captura GTO");
includes(service, "GtoObserverLifecyclePolicy.status(", "política de ciclo aplicada pelo supervisor");
includes(lifecycle, "GTO_BACKGROUND_OBSERVER_ACTIVE", "estado de fundo ativo");
includes(lifecycle, "return enabled && !explicitStop && nvuSessionActive;", "regra de preservação fora do GTO");
includes(lifecycle, "SERVICE_STOPPED", "estado de parada terminal");

includes(main, "GtoObserverService.reportMainActivityForeground(false)", "onPause apenas informa a Activity");
assert.ok(!main.includes("GtoObserverService.ACTION_STOP"), "MainActivity não pode parar o Observador no ciclo da Activity");
includes(setup, "Observador: <strong>ativo · aguardando o retorno do GTO; sessão preservada.", "UI sem falso recuperando leitura");
includes(setup, "GTO fechado, minimizado ou em segundo plano não encerra o serviço.", "contrato visual de persistência");
includes(plugin, 'status.put("observerLifecycleActive"', "status nativo do lifecycle");
includes(plugin, 'status.put("gtoCaptureReady"', "status nativo da captura GTO");
includes(types, "observerLifecycleStatus?", "tipo do lifecycle");
includes(types, "GTO_BACKGROUND_OBSERVER_ACTIVE", "tipo do estado de fundo");
includes(build, "versionCode 140", "versionCode HF86");
includes(build, 'versionName "1.0.140"', "versionName HF86");

console.log("PASS HF69: Observador separado do GTO, persistência em background e parada explícita verificados.");
