import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const audio = read("android/app/src/main/java/com/nvu/operacional/NvuAudioManager.java");
const plugin = read("android/app/src/main/java/com/nvu/operacional/GtoObserverPlugin.java");
const build = read("android/app/build.gradle");
const raw = path.join(root, "android/app/src/main/res/raw/nvu_gto_automated_start_voice_pt_br.mp3");

assert.ok(fs.statSync(raw).size > 1024, "MP3 de abertura automatizada deve existir e ter conteúdo");
assert.ok(audio.includes("GTO_AUTOMATED_START"), "gerenciador deve ter categoria própria para abertura GTO");
assert.ok(audio.includes("playGtoAutomatedStartVoice"), "gerenciador deve expor o áudio de abertura GTO");
assert.ok(audio.includes("R.raw.nvu_gto_automated_start_voice_pt_br"), "gerenciador deve apontar para o novo MP3");
assert.ok(audio.includes("KEY_LAST_GTO_START_EVENT_ID"), "áudio de abertura deve ser deduplicado por evento");
assert.ok(service.includes("playGtoAutomatedStartVoiceIfEligible(now);"), "áudio deve ser ligado à entrada real em primeiro plano");
assert.ok(service.includes("prefs.getBoolean(\"gtoWorkLaunchPrepared\", false)"), "áudio deve exigir abertura preparada pelo modo automatizado");
assert.ok(service.includes("prefs.getLong(\"gtoLaunchRequestedAt\", 0L)"), "evento deve usar o lançamento GTO solicitado");
assert.ok(service.includes("now - requestedAt > 120000L"), "lançamento antigo não pode disparar áudio tardio");
assert.equal((service.match(/playGtoAutomatedStartVoice\(/g) || []).length, 1, "serviço deve disparar o novo áudio em um único ponto");
assert.equal((service.match(/playPauseActionVoice\(/g) || []).length, 1, "áudio de pause deve permanecer em seu único ponto de alerta");
assert.ok(service.includes("boolean firstPromptEmission = !pausePromptVisible;"), "alerta de pause mantém reprodução apenas na primeira emissão");
assert.ok(plugin.includes("GtoObserverService.markGtoLaunchRequestedIfRunning();"), "plugin deve marcar a abertura automatizada");
assert.ok(plugin.includes("context.startActivity(launchIntent);"), "plugin deve abrir o GTO após preparar o fluxo");
assert.ok(build.includes("versionCode 140"), "versionCode HF86");
assert.ok(build.includes('versionName "1.0.140"'), "versionName HF86");

console.log("PASS HF72: áudio novo exclusivo da primeira entrada real do GTO em abertura automatizada; pause permanece separado.");
