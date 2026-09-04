import assert from "node:assert/strict";
import {
  targetBaseSaturationForPh,
  estimateHAlFromSmpIndex,
  computeCtcPh7,
  computeBaseSaturationPercent,
  computeLimingDoseByBaseSaturation,
  computeLimingDoseBySmpIndex,
} from "../src/domain/liming-engine.ts";

// 1. Correspondência pH-alvo -> V% alvo, exatamente como o manual declara.
assert.equal(targetBaseSaturationForPh("5.5"), 65);
assert.equal(targetBaseSaturationForPh("6.0"), 75);
assert.equal(targetBaseSaturationForPh("6.5"), 85);

// 2. H+Al a partir do índice SMP -- fórmula de Kaminski et al. (2001).
// SMP=6,0 -> H+Al = e^(10,665 - 1,1483*6,0)/10 = e^(3,7752)/10 ≈ 4,3613
const hAlSmp60 = estimateHAlFromSmpIndex(6.0);
assert.ok(Math.abs(hAlSmp60 - 4.3613) < 0.001, `H+Al(SMP=6,0) esperado ~4,3613, obtido ${hAlSmp60}`);
// SMP mais baixo (solo mais ácido) deve dar H+Al maior.
const hAlSmp50 = estimateHAlFromSmpIndex(5.0);
assert.ok(hAlSmp50 > hAlSmp60, "SMP menor (mais ácido) deve estimar H+Al maior");

// 3. CTCpH7,0 = Ca + Mg + K + (H+Al).
const ctc = computeCtcPh7({ ca: 4.0, mg: 1.5, k: 0.3 }, hAlSmp60);
assert.ok(Math.abs(ctc - (4.0 + 1.5 + 0.3 + hAlSmp60)) < 1e-9);
assert.ok(Math.abs(ctc - 10.1613) < 0.001, `CTCpH7 esperado ~10,1613, obtido ${ctc}`);

// 4. V% = (S/CTCpH7,0) x 100, S = Ca+Mg+K.
const v = computeBaseSaturationPercent({ ca: 4.0, mg: 1.5, k: 0.3 }, ctc);
assert.ok(Math.abs(v - 57.087) < 0.01, `V% esperado ~57,09, obtido ${v}`);

// 5. NC = [(V1-V2)/100] x CTCpH7,0 -- caso didático direto do manual.
// V1=75% (pH 6,0), V2=40%, CTCpH7=12 -> NC = 0,35 x 12 = 4,2 t/ha.
const dose1 = computeLimingDoseByBaseSaturation({ targetPh: "6.0", measuredBaseSaturationPercent: 40, ctcPh7: 12 });
assert.equal(dose1.needed, true);
if (dose1.needed) {
  assert.equal(dose1.doseTonPerHaPrnt100, 4.2);
  assert.equal(dose1.targetBaseSaturationPercent, 75);
}

// 6. Solo já acima da meta -> calagem não indicada por este critério (sem inventar dose negativa).
const dose2 = computeLimingDoseByBaseSaturation({ targetPh: "5.5", measuredBaseSaturationPercent: 80, ctcPh7: 10 });
assert.equal(dose2.needed, false);
if (!dose2.needed) {
  assert.match(dose2.reason, /não é indicada/);
}

// 7. Exatamente na meta (V2 == V1) -> também não precisa (>=, não só >).
const dose3 = computeLimingDoseByBaseSaturation({ targetPh: "6.5", measuredBaseSaturationPercent: 85, ctcPh7: 8 });
assert.equal(dose3.needed, false);

// 8. Ponta a ponta: só com SMP + cátions (sem CTCpH7,0 pronta no laudo),
// como aconteceria com um laudo real de laboratório.
const hAl = estimateHAlFromSmpIndex(5.4);
const ctcReal = computeCtcPh7({ ca: 2.8, mg: 0.9, k: 0.15 }, hAl);
const vReal = computeBaseSaturationPercent({ ca: 2.8, mg: 0.9, k: 0.15 }, ctcReal);
const doseReal = computeLimingDoseByBaseSaturation({ targetPh: "6.0", measuredBaseSaturationPercent: vReal, ctcPh7: ctcReal });
assert.equal(doseReal.needed, true);
if (doseReal.needed) {
  assert.ok(doseReal.doseTonPerHaPrnt100 > 0);
}

// 9. Tabela 5.2 (índice SMP) -- valores tabelados exatos, direto da Tabela 5.2
// conferida contra o PDF oficial reextraído com `pdftotext -table`.
const smp52 = computeLimingDoseBySmpIndex(5.2, "6.0");
assert.equal(smp52.doseTonPerHaPrnt100, 8.3);
assert.equal(smp52.interpolated, false);

const smp44 = computeLimingDoseBySmpIndex(4.4, "6.5");
assert.equal(smp44.doseTonPerHaPrnt100, 29.0);

const smp60 = computeLimingDoseBySmpIndex(6.0, "5.5");
assert.equal(smp60.doseTonPerHaPrnt100, 1.6);

// 10. Extremos abertos: SMP menor que 4,4 usa a linha de 4,4 (faixa aberta,
// como o próprio manual indica); SMP maior que 7,1 usa a linha de 7,1 (zero).
const smpBaixo = computeLimingDoseBySmpIndex(3.5, "6.0");
assert.equal(smpBaixo.doseTonPerHaPrnt100, 21.0);
assert.equal(smpBaixo.interpolated, false);

const smpAlto = computeLimingDoseBySmpIndex(7.5, "6.5");
assert.equal(smpAlto.doseTonPerHaPrnt100, 0);

// 11. Interpolação entre pontos tabelados (SMP=5,25, entre 5,2 e 5,3, pH 6,0):
// tabela tem 8,3 em 5,2 e 7,5 em 5,3 -- na metade do intervalo, dose ~ 7,9.
const smpInterp = computeLimingDoseBySmpIndex(5.25, "6.0");
assert.equal(smpInterp.interpolated, true);
assert.ok(Math.abs(smpInterp.doseTonPerHaPrnt100 - 7.9) < 0.01, `esperado ~7,9, obtido ${smpInterp.doseTonPerHaPrnt100}`);

console.log("liming-engine: 11 cenários aprovados");
