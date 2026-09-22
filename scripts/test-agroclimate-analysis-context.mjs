import assert from "node:assert/strict";
import {
  parseExplicitZarcSeasonLabel,
  resolveInitialAgroclimateCivilTime,
} from "../src/domain/agroclimate-analysis-context.ts";

const rs=resolveInitialAgroclimateCivilTime("rs",new Date("2026-09-20T12:00:00Z"));
assert.deepEqual(rs,{
  stateCode:"RS",
  timeZone:"America/Sao_Paulo",
  utcOffset:"-03:00",
});

const sc=resolveInitialAgroclimateCivilTime(" SC ",new Date("2026-01-15T12:00:00Z"));
assert.equal(sc?.utcOffset,"-03:00");

assert.equal(resolveInitialAgroclimateCivilTime("AM"),null);
assert.equal(resolveInitialAgroclimateCivilTime(null),null);
assert.throws(
  ()=>resolveInitialAgroclimateCivilTime("RS",new Date("invalid")),
  /AGROCLIMATE_REFERENCE_DATE_INVALID/,
);

assert.deepEqual(
  parseExplicitZarcSeasonLabel("Safra 2026/2027"),
  {startYear:2026,endYear:2027},
);
assert.deepEqual(
  parseExplicitZarcSeasonLabel("2025-2026"),
  {startYear:2025,endYear:2026},
);
assert.equal(parseExplicitZarcSeasonLabel("Safra 2026"),null);
assert.equal(parseExplicitZarcSeasonLabel("2026/2028"),null);
assert.equal(parseExplicitZarcSeasonLabel("2025/2026 e 2026/2027"),null);
assert.equal(parseExplicitZarcSeasonLabel(null),null);

console.log("agroclimate-analysis-context: safra e fuso só são resolvidos quando explícitos/homologados");
