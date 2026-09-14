import assert from "node:assert/strict";
import { evaluateSourceVerificationCompleteness } from "../src/domain/source-verification.ts";

assert.deepEqual(evaluateSourceVerificationCompleteness({ importCount: 0, archivedCount: 0, verifiedCount: 0 }), {
  verified: false,
  blockers: ["NO_IMPORT"],
});

const missingArchive = evaluateSourceVerificationCompleteness({ importCount: 2, archivedCount: 1, verifiedCount: 1 });
assert.equal(missingArchive.verified, false);
assert.deepEqual(missingArchive.blockers, ["RAW_SOURCE_MISSING", "HUMAN_CONFIRMATION_MISSING"]);

const missingHuman = evaluateSourceVerificationCompleteness({ importCount: 2, archivedCount: 2, verifiedCount: 1 });
assert.equal(missingHuman.verified, false);
assert.deepEqual(missingHuman.blockers, ["HUMAN_CONFIRMATION_MISSING"]);

assert.deepEqual(evaluateSourceVerificationCompleteness({ importCount: 2, archivedCount: 2, verifiedCount: 2 }), {
  verified: true,
  blockers: [],
});

console.log("source-verification: todos os imports exigem arquivo bruto + confirmação exata; sem backfill por inferência");
