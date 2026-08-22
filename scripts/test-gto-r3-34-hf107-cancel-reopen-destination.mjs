import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const servicePath = path.join(
  root,
  "android/app/src/main/java/com/nvu/operacional/GtoObserverService.java"
);
const service = fs.readFileSync(servicePath, "utf8");
const checks = [];
function check(name, condition) {
  const ok = Boolean(condition);
  checks.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}

check(
  "cancel reset removes selected cargo consensus",
  service.includes('.remove("selectedCargoConsensusReads")')
    && service.includes('.remove("selectedCargoSource")')
);
check(
  "cancel reset removes pause cargo consensus",
  service.includes('.remove("pauseCargoConsensusValue")')
    && service.includes('.remove("pauseCargoConsensusReads")')
    && service.includes('.remove("pauseCargoConsensusStatus")')
);
check(
  "cancel reset removes focused cargo consensus",
  service.includes('.remove("focusedCargoConsensusValue")')
    && service.includes('.remove("focusedCargoConsensusReads")')
    && service.includes('.remove("focusedCargoConsensusStatus")')
);
check(
  "cancel reset removes pause-only mode",
  service.includes('.remove("pauseRecoveryOnly")')
    && service.includes('.remove("pauseManualFallbackAllowed")')
);
check(
  "pause destination uses unique official candidate",
  service.includes("private String canonicalizePauseDestination(String raw)")
    && service.includes("GtoCityTextResolver.uniqueOfficialCanonicalCandidate(")
    && service.includes("currentTrustedGtoCities()")
);
const canonicalize = service.indexOf("private String canonicalizePauseDestination(String raw)");
const completeReader = service.indexOf("private FreightOption readPauseFreight(");
const incompleteReader = service.indexOf("private FreightOption readPauseFreightWithoutCompleteness(");
check(
  "complete pause reader canonicalizes destination",
  completeReader >= 0 && service.indexOf("canonicalizePauseDestination(freight.destination)", completeReader) >= 0
);
check(
  "incomplete pause reader canonicalizes destination",
  incompleteReader >= 0 && service.indexOf("canonicalizePauseDestination(freight.destination)", incompleteReader) >= 0
);
check(
  "Nova Mocaé regression is explicit",
  fs.readFileSync(
    path.join(root, "scripts/java-tests/com/nvu/operacional/GtoHf28KnownDestinationPolicyTest.java"),
    "utf8"
  ).includes('"Nova Mocaé"')
);

const failed = checks.filter((ok) => !ok).length;
if (failed) {
  console.error(`\n${failed} HF107 check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} HF107 checks passed.`);
