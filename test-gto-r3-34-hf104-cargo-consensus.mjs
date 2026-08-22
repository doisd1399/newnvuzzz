import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const servicePath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java");
const syncPath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoAutoTripSync.java");
const policyPath = path.join(root, "android/app/src/main/java/com/nvu/operacional/GtoCargoConsensusPolicy.java");
const testPath = path.join(root, "scripts/java-tests/com/nvu/operacional/GtoCargoConsensusPolicyTest.java");
const service = fs.readFileSync(servicePath, "utf8");
const sync = fs.readFileSync(syncPath, "utf8");
const policy = fs.readFileSync(policyPath, "utf8");
const checks = [];
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

check("cargo policy requires two reads", policy.includes("REQUIRED_READS = 2") && policy.includes("confirmed(int reads)"));
check("pause cargo stores independent consensus", service.includes("recordPauseCargoRead(freight.cargo)") && service.includes("pauseCargoConsensusReads"));
check("focused cargo retry stores independent consensus", service.includes("recordFocusedCargoRead(cargo)") && service.includes("lastCargoAutoRecoveryReads"));
check("first review field blocks unconfirmed cargo", service.includes("if (!cargoHasRequiredConsensus(draft)) return GtoFreightReviewPolicy.CARGO"));
check("lock blocks automatic cargo without consensus", sync.includes("Carga sem duas leituras concordantes") && sync.includes("GtoCargoConsensusPolicy.confirmed(cargoReads)"));
check("manual cargo remains explicit exception", sync.includes("MANUAL_DRIVER") && service.includes("reviewCargoSource"));
check("HF104 test covers OCR near miss", testPath.includes("GtoCargoConsensusPolicyTest.java"));

const tmp = fs.mkdtempSync("/tmp/nvu-hf104-");
try {
  const run = spawnSync("java", [
    "scripts/java-tests/JavaTestRunner.java", tmp,
    "com.nvu.operacional.GtoCargoConsensusPolicyTest",
    "android/app/src/main/java/com/nvu/operacional/GtoFreightReviewPolicy.java",
    "android/app/src/main/java/com/nvu/operacional/GtoCargoConsensusPolicy.java",
    "android/app/src/main/java/com/nvu/operacional/GtoMoneyValue.java",
    "scripts/java-tests/com/nvu/operacional/GtoCargoConsensusPolicyTest.java",
  ], { cwd: root, encoding: "utf8" });
  const output = `${run.stdout || ""}\n${run.stderr || ""}`.trim();
  check("HF104 Java consensus examples compile and pass", run.status === 0 && output.includes("PASS"), output);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`\n${failed.length} HF104 check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} HF104 checks passed.`);
