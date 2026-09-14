import assert from "node:assert/strict";
import { evaluateInterpretationReviewTransition } from "../src/domain/interpretation-review.ts";

const latest = true;

assert.deepEqual(
  evaluateInterpretationReviewTransition({ currentStatus: "IN_REVIEW", approve: true, isLatestRevision: latest }),
  { allowed: true, noOp: false, nextStatus: "APPROVED", reason: null },
);
assert.deepEqual(
  evaluateInterpretationReviewTransition({ currentStatus: "IN_REVIEW", approve: false, isLatestRevision: latest }),
  { allowed: true, noOp: true, nextStatus: "IN_REVIEW", reason: null },
);
assert.deepEqual(
  evaluateInterpretationReviewTransition({ currentStatus: "APPROVED", approve: true, isLatestRevision: latest }),
  { allowed: true, noOp: true, nextStatus: "APPROVED", reason: null },
);

assert.equal(evaluateInterpretationReviewTransition({ currentStatus: "APPROVED", approve: false, isLatestRevision: latest }).allowed, false);
assert.equal(evaluateInterpretationReviewTransition({ currentStatus: "CALCULATED", approve: true, isLatestRevision: latest }).allowed, false);
assert.equal(evaluateInterpretationReviewTransition({ currentStatus: "CALCULATED", approve: false, isLatestRevision: latest }).allowed, false);
assert.equal(evaluateInterpretationReviewTransition({ currentStatus: "PUBLISHED", approve: true, isLatestRevision: latest }).allowed, false);
assert.equal(evaluateInterpretationReviewTransition({ currentStatus: "SUPERSEDED", approve: false, isLatestRevision: latest }).allowed, false);
assert.equal(evaluateInterpretationReviewTransition({ currentStatus: "IN_REVIEW", approve: true, isLatestRevision: false }).allowed, false);
assert.equal(evaluateInterpretationReviewTransition({ currentStatus: "AI_GENERATED", approve: true, isLatestRevision: latest }).allowed, false);
assert.deepEqual(
  evaluateInterpretationReviewTransition({ currentStatus: "AI_GENERATED", approve: false, isLatestRevision: latest }),
  { allowed: true, noOp: false, nextStatus: "IN_REVIEW", reason: null },
);

console.log("interpretation-review: estados e imutabilidade protegidos");
