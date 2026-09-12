// CI gate for the governance layer (hardening sprint s.27/s.29).
//
// Two different things are checked here and they fail differently on purpose:
//
//   Structural validity  -> FAILS the build. A capability with no owner, a
//                           reporting cycle, an escalation path that ends
//                           nowhere, or an agent standing in for a human
//                           approver are all defects in the model itself.
//
//   Pre-LIVE / LIVE      -> REPORTED, never fails the build. NOT_READY is the
//                           correct and expected state today: 13 capabilities
//                           have no staffed owner and 10 manual gates are
//                           unattested. Failing CI on that would make the
//                           signal permanently red and therefore ignored, and
//                           would tempt someone to weaken the gate to get a
//                           green check. The gate exists to block launches,
//                           not pull requests.
//
// So a green CI run means "the model is sound", never "RT may go live".
import { assertGovernanceValid } from "../src/lib/governance/validate";
import { evaluateReadiness } from "../src/lib/governance/readiness";
import { RT_ORG_NODES } from "../src/lib/governance/org";
import { RT_ACCOUNTABILITY_MATRIX } from "../src/lib/governance/capabilities";

const report = evaluateReadiness();
const planned = RT_ORG_NODES.filter((n) => n.status === "PLANNED").length;
const preLive = RT_ACCOUNTABILITY_MATRIX.filter((c) => c.preLiveRequired);
const blocked = report.capabilities.filter((c) => c.blockers.length > 0);

console.log("RT governance check");
console.log(`  org nodes            ${RT_ORG_NODES.length} (${planned} planned)`);
console.log(`  capabilities         ${RT_ACCOUNTABILITY_MATRIX.length} (${preLive.length} pre-LIVE required)`);
console.log("");
console.log(`  ORGANIZATIONAL       ${report.organizationalStatus}`);
console.log(`  PRE_LIVE             ${report.preLiveArchitectureStatus}`);
console.log(`  LIVE                 ${report.liveStatus}`);
console.log("");

if (blocked.length > 0) {
  console.log(`Pre-LIVE capabilities without a staffed owner (${blocked.length}):`);
  for (const cap of blocked) console.log(`  - ${cap.capability}: ${cap.blockers.join("; ")}`);
  console.log("");
}

const unattested = report.manualGates.filter((g) => g.status !== "READY");
if (unattested.length > 0) {
  console.log(`Manual gates not attested (${unattested.length}): no test can satisfy these.`);
  for (const gate of unattested) console.log(`  - ${gate.gate}: ${gate.status}`);
  console.log("");
}

// Throws with a per-violation report when the model itself is unsound.
assertGovernanceValid();

console.log("Structural validation passed. This is NOT a launch authorization.");
