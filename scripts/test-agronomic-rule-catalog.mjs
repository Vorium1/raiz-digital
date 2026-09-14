import assert from "node:assert/strict";
import {
  AGRONOMIC_RULES,
  SOURCE_LEDGER,
  RESEARCH_SNAPSHOT_ID,
  evaluateAgronomicRuleAutomation,
  buildRuleTrace,
  resolveAgronomicExecutionStatus,
} from "../src/domain/agronomic-rule-catalog.ts";

assert.ok(AGRONOMIC_RULES.length >= 15);
assert.equal(new Set(AGRONOMIC_RULES.map((rule) => rule.ruleId)).size, AGRONOMIC_RULES.length);
assert.ok(Object.values(SOURCE_LEDGER).every((source) => /^[a-f0-9]{64}$/.test(source.sha256) && source.bytes > 0));
assert.ok(AGRONOMIC_RULES.every((rule) => rule.sourceSnapshotId === RESEARCH_SNAPSHOT_ID));

for (const ruleId of ["N-MILHO-CQFS-2016", "N-TRIGO-EMBRAPA-2026", "N-CANOLA-CQFS-2016", "N-GRAMINEA-INVERNO-CQFS-2016", "LIME-PRNT", "PRODUCT-MASS-ALGEBRA", "VRA-MASS-TOTAL"]) {
  const decision = evaluateAgronomicRuleAutomation(ruleId);
  assert.equal(decision.allowed, true, `${ruleId} deveria estar liberada para execução determinística`);
  assert.equal(decision.status, "READY_FOR_IMPLEMENTATION");
}

for (const ruleId of ["N-ARROZ-SOSBAI-2025", "MO-SOJA-CQFS-2016", "GESSO-CERRADO-EMBRAPA-2005", "VRA-SUPPORT-GATE", "GYPSUM-RS-SC-AUTOMATIC"]) {
  const decision = evaluateAgronomicRuleAutomation(ruleId);
  assert.equal(decision.allowed, false, `${ruleId} não pode virar dose automática`);
  assert.equal(decision.status, "REQUIRES_AGRONOMIST_REVIEW");
}

for (const ruleId of ["CARINATA-RS-SC-NUTRITION", "MICRONUTRIENT-GENERIC-RS-SC"]) {
  const decision = evaluateAgronomicRuleAutomation(ruleId);
  assert.equal(decision.allowed, false);
  assert.equal(decision.status, "INSUFFICIENT_EVIDENCE");
}

const unknown = evaluateAgronomicRuleAutomation("DOSE-INVENTADA");
assert.equal(unknown.allowed, false);
assert.equal(unknown.status, "UNKNOWN_RULE");

const trace = buildRuleTrace("N-TRIGO-EMBRAPA-2026");
assert.deepEqual(trace, {
  ruleId: "N-TRIGO-EMBRAPA-2026",
  ruleVersion: "1.0.0",
  sourceSnapshotId: RESEARCH_SNAPSHOT_ID,
  sourceTitle: "Informações técnicas para trigo e triticale, safra 2026",
  sourceInstitution: "Embrapa Trigo",
  sourceYear: 2026,
  sourceLocator: "Tabela 3, pp.29-33",
  executionStatus: "READY_FOR_IMPLEMENTATION",
});

// O dado concreto pode tornar uma execução mais conservadora, nunca mais permissiva
// do que o catálogo técnico homologado.
assert.equal(
  resolveAgronomicExecutionStatus("N-MILHO-CQFS-2016", "REQUIRES_AGRONOMIST_REVIEW"),
  "REQUIRES_AGRONOMIST_REVIEW",
);
assert.equal(
  resolveAgronomicExecutionStatus("VRA-SUPPORT-GATE", "READY_FOR_IMPLEMENTATION"),
  "REQUIRES_AGRONOMIST_REVIEW",
);
assert.equal(
  resolveAgronomicExecutionStatus("CARINATA-RS-SC-NUTRITION", "READY_FOR_IMPLEMENTATION"),
  "INSUFFICIENT_EVIDENCE",
);

console.log("agronomic-rule-catalog: execução só para READY; runtime só rebaixa; ledger e trace ok");
