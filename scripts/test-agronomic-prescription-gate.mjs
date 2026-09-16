import assert from "node:assert/strict";
import { checkPrescriptionGate, PRESCRIPTION_GATE_BLOCKED_REASON } from "../src/domain/agronomic-prescription-gate.ts";

let n = 0;
function scenario(name, fn) { fn(); n++; }

scenario("sem interpretação -> bloqueado", () => {
  const result = checkPrescriptionGate(null);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, PRESCRIPTION_GATE_BLOCKED_REASON);
});

scenario("CALCULATED sem cobertura -> bloqueado", () => {
  assert.equal(checkPrescriptionGate("CALCULATED").allowed, false);
});

scenario("IN_REVIEW -> permitido para montar a decisão antes da validação humana", () => {
  assert.equal(checkPrescriptionGate("IN_REVIEW").allowed, true);
});

scenario("APPROVED -> permitido", () => {
  assert.equal(checkPrescriptionGate("APPROVED").allowed, true);
});

scenario("PUBLISHED -> permitido", () => {
  assert.equal(checkPrescriptionGate("PUBLISHED").allowed, true);
});

scenario("status desconhecido -> bloqueado (fail closed)", () => {
  assert.equal(checkPrescriptionGate("SUPERSEDED").allowed, false);
});

console.log(`agronomic-prescription-gate: ${n} cenários aprovados`);
