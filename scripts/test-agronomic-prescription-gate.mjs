import assert from "node:assert/strict";
import { checkPrescriptionGate, PRESCRIPTION_GATE_BLOCKED_REASON } from "../src/domain/agronomic-prescription-gate.ts";

let n = 0;
function scenario(name, fn) { fn(); n++; }

// 1. sem interpretação (null) -> bloqueado
scenario("sem interpretação -> bloqueado", () => {
  const result = checkPrescriptionGate(null);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, PRESCRIPTION_GATE_BLOCKED_REASON);
});

// 2. CALCULATED (motor rodou, zero parâmetro interpretável) -> bloqueado
scenario("CALCULATED -> bloqueado", () => {
  const result = checkPrescriptionGate("CALCULATED");
  assert.equal(result.allowed, false);
});

// 3. IN_REVIEW (interpretável, mas ainda sem revisão humana) -> bloqueado
scenario("IN_REVIEW -> bloqueado (achado real: versão anterior deste gate aceitava, errado)", () => {
  const result = checkPrescriptionGate("IN_REVIEW");
  assert.equal(result.allowed, false);
});

// 4. APPROVED -> permitido (só aqui a rota real segue pro provider)
scenario("APPROVED -> permitido", () => {
  const result = checkPrescriptionGate("APPROVED");
  assert.equal(result.allowed, true);
});

// status desconhecido/inesperado -> bloqueado por padrão (fail closed, nunca abre por engano)
scenario("status desconhecido -> bloqueado (fail closed)", () => {
  const result = checkPrescriptionGate("PUBLISHED");
  assert.equal(result.allowed, false);
});

console.log(`agronomic-prescription-gate: ${n} cenários aprovados`);
