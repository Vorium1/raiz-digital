import assert from "node:assert/strict";
import { CRITICAL_RELEASE_ISSUES, evaluateReleasePromotionGate } from "../src/domain/release-promotion-gate.ts";
import { runReleasePromotionGate } from "./check-release-promotion-gate.mjs";

assert.deepEqual([...CRITICAL_RELEASE_ISSUES], [24, 25, 27]);

const nonMain = evaluateReleasePromotionGate({
  baseRef: "develop",
  headRef: "feature/x",
  issueStates: {},
});
assert.equal(nonMain.applicable, false);
assert.equal(nonMain.allowed, true);

const wrongHead = evaluateReleasePromotionGate({
  baseRef: "main",
  headRef: "feature/x",
  issueStates: { 24: "closed", 25: "closed", 27: "closed" },
});
assert.equal(wrongHead.allowed, false);
assert.ok(wrongHead.blockers.some((b) => b.startsWith("PROMOTION_TO_MAIN_MUST_ORIGINATE_FROM_DEVELOP")));

const openIssues = evaluateReleasePromotionGate({
  baseRef: "main",
  headRef: "develop",
  issueStates: { 24: "open", 25: "closed", 27: "open" },
});
assert.equal(openIssues.allowed, false);
assert.ok(openIssues.blockers.includes("CRITICAL_RELEASE_ISSUE_OPEN:#24"));
assert.ok(openIssues.blockers.includes("CRITICAL_RELEASE_ISSUE_OPEN:#27"));

const unknown = evaluateReleasePromotionGate({
  baseRef: "main",
  headRef: "develop",
  issueStates: { 24: "closed", 25: "unknown", 27: "closed" },
});
assert.equal(unknown.allowed, false);
assert.ok(unknown.blockers.includes("CRITICAL_RELEASE_ISSUE_STATE_UNKNOWN:#25"));

const allClosed = evaluateReleasePromotionGate({
  baseRef: "main",
  headRef: "develop",
  issueStates: { 24: "closed", 25: "closed", 27: "closed" },
});
assert.equal(allClosed.allowed, true);
assert.deepEqual(allClosed.blockers, []);

const logs = [];
const logger = {
  log: (value) => logs.push(String(value)),
  error: (value) => logs.push(String(value)),
};
const overrideBlocked = await runReleasePromotionGate({
  RAIZ_PROMOTION_BASE_REF: "main",
  RAIZ_PROMOTION_HEAD_REF: "develop",
  RAIZ_PROMOTION_ISSUE_STATES_JSON: JSON.stringify({ 24: "closed", 25: "open", 27: "closed" }),
}, logger);
assert.equal(overrideBlocked.allowed, false);
assert.ok(logs.some((line) => line.includes("#25=open")));

const overridePass = await runReleasePromotionGate({
  RAIZ_PROMOTION_BASE_REF: "main",
  RAIZ_PROMOTION_HEAD_REF: "develop",
  RAIZ_PROMOTION_ISSUE_STATES_JSON: JSON.stringify({ 24: "closed", 25: "closed", 27: "closed" }),
}, logger);
assert.equal(overridePass.allowed, true);

console.log("release-promotion-gate: 7 cenários aprovados");
