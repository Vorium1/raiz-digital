import assert from "node:assert/strict";
import {
  checkPrescriptionDraftGate,
  checkPrescriptionGate,
  PRESCRIPTION_DRAFT_GATE_BLOCKED_REASON,
  PRESCRIPTION_DRAFT_STATUS,
  PRESCRIPTION_GATE_BLOCKED_REASON,
} from "../src/domain/agronomic-prescription-gate.ts";

let n = 0;
function scenario(name, fn) { fn(); n++; }

scenario("rascunho sempre nasce PENDING_REVIEW", () => {
  assert.equal(PRESCRIPTION_DRAFT_STATUS, "PENDING_REVIEW");
});

scenario("sem interpretação -> ambos bloqueados", () => {
  assert.deepEqual(checkPrescriptionGate(null), { allowed: false, reason: PRESCRIPTION_GATE_BLOCKED_REASON });
  assert.deepEqual(checkPrescriptionDraftGate(null), { allowed: false, reason: PRESCRIPTION_DRAFT_GATE_BLOCKED_REASON });
});

scenario("CALCULATED -> ambos bloqueados", () => {
  assert.equal(checkPrescriptionGate("CALCULATED").allowed, false);
  assert.equal(checkPrescriptionDraftGate("CALCULATED").allowed, false);
});

scenario("IN_REVIEW -> pode preparar rascunho, nunca promover oficialmente", () => {
  assert.equal(checkPrescriptionDraftGate("IN_REVIEW").allowed, true);
  assert.equal(checkPrescriptionGate("IN_REVIEW").allowed, false);
});

scenario("APPROVED -> pode preparar/regenerar e pode promover oficialmente", () => {
  assert.equal(checkPrescriptionDraftGate("APPROVED").allowed, true);
  assert.equal(checkPrescriptionGate("APPROVED").allowed, true);
});

scenario("status desconhecido -> ambos fail closed", () => {
  assert.equal(checkPrescriptionGate("PUBLISHED").allowed, false);
  assert.equal(checkPrescriptionDraftGate("PUBLISHED").allowed, false);
});

console.log(`agronomic-prescription-gate: ${n} cenários aprovados (rascunho separado de promoção oficial)`);
