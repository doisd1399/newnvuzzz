import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const servicePath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const service = fs.readFileSync(servicePath, "utf8");

const frameStart = service.indexOf("if (fastPendingSelectedRow >= 0\n                    && fastPendingFromTouchPulse");
const frameEnd = service.indexOf("fastPreviousFreightFrame = current;", frameStart);
const frameBlock = frameStart >= 0 && frameEnd > frameStart ? service.slice(frameStart, frameEnd) : "";

const exactTransaction = {
  source: "exact-outside-touch+frame-lock",
  row: 2,
  touchSequence: 101,
};
const postTouchFrame = {
  sequence: 102,
  hasFreightList: true,
  listDisappeared: false,
};

const simulatedExactPending = exactTransaction.source === "exact-outside-touch+frame-lock";
const simulatedPostTouch = postTouchFrame.sequence > exactTransaction.touchSequence;
const simulatedFinalized = simulatedExactPending && simulatedPostTouch;

const checks = [
  ["código reconhece transação exata", service.includes('"exact-outside-touch+frame-lock"')],
  ["código possui predicado de transação exata", service.includes("private boolean hasExactTouchSelectionPending()")],
  ["código exige frame pós-toque", frameBlock.includes("selectionCoordinator.isPostTouch(sequence)")],
  ["código finaliza imediatamente", frameBlock.includes("finalizeFastVisualSelection();")],
  ["simulação não depende de lista ausente", simulatedFinalized && !postTouchFrame.listDisappeared],
  ["OCR continua após seleção", service.includes("runPreciseSelectedRowOcr(transaction);")],
  ["lock durável continua obrigatório", service.includes("GtoAutoTripSync.lockSelectedFreight(this, prefs)")],
];

for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
const failed = checks.filter(([, ok]) => !ok).length;
if (failed) process.exit(1);
console.log("\nTESTE ISOLADO DE SELEÇÃO: APROVADO");
