import assert from "node:assert/strict";
import {
  classifyPhosphorusCFSEMG1999,
  computeNivelCriticoP_ContinuousApprox,
  computeFosforoRelativo,
  classifyFosforoRelativoPercent,
} from "../src/domain/phosphorus-engine.ts";

// 1-4. Os 4 pontos REAIS de uma tabela de laudo (imagem do material do Cabeda,
// "Resultados de Fósforo por Profundidade", conferida em docs/PROJECT_STATE.md)
// -- a equação contínua precisa reproduzir os 4 NC e PR com 2 casas decimais.
const real = [
  { pMehlich: 16.94, pRem: 24.31, ncEsperado: 13.46, prEsperado: 125.83 },
  { pMehlich: 5.11, pRem: 17.68, ncEsperado: 10.86, prEsperado: 47.04 },
  { pMehlich: 3.01, pRem: 12.92, ncEsperado: 9.08, prEsperado: 33.14 },
  { pMehlich: 4.9, pRem: 12.67, ncEsperado: 8.99, prEsperado: 54.49 },
];

for (const row of real) {
  const nc = computeNivelCriticoP_ContinuousApprox(row.pRem);
  assert.ok(Math.abs(nc - row.ncEsperado) < 0.01, `NC(P-rem=${row.pRem}) esperado ${row.ncEsperado}, obtido ${nc}`);
  const result = computeFosforoRelativo(row.pMehlich, row.pRem);
  assert.ok(
    Math.abs(result.fosforoRelativoPercent - row.prEsperado) < 0.05,
    `PR(P=${row.pMehlich}, P-rem=${row.pRem}) esperado ${row.prEsperado}%, obtido ${result.fosforoRelativoPercent}%`,
  );
}
console.log("phosphorus-engine: 4 pontos reais de laudo batendo na equação contínua");

// 5. Tabela CFSEMG 1999 -- pontos de fronteira exatos, conferidos contra a
// reprodução da Embrapa Milho e Sorgo (Tabela 3, Alvarez V. et al. 1999).
const bracket1030 = classifyPhosphorusCFSEMG1999(11.4, 19); // limite Baixo/Médio da faixa 10-19
assert.equal(bracket1030.classification, "MEDIO");
assert.equal(bracket1030.nivelCriticoMgDm3, 11.4);

const bracketBaixo = classifyPhosphorusCFSEMG1999(6.0, 19); // == muitoBaixoMax da faixa 10-19
assert.equal(bracketBaixo.classification, "MUITO_BAIXO");

const bracketMuitoBom = classifyPhosphorusCFSEMG1999(30.0, 30); // > bomMax(24.0) da faixa 19-30
assert.equal(bracketMuitoBom.classification, "MUITO_BOM");

// 6. Fora do intervalo coberto pela tabela (P-rem > 60) -- não inventa, retorna null com motivo.
const foraDoIntervalo = classifyPhosphorusCFSEMG1999(10, 75);
assert.equal(foraDoIntervalo.classification, null);
assert.match(foraDoIntervalo.reason, /fora do intervalo/);

// 7. Classificação por Tabela 3 usando os 4 pontos reais -- 3 das 4 linhas
// devem concordar com a classificação por PR(%); a 4ª linha (P-rem=12.67,
// P=4,90) diverge de propósito -- é o exemplo real documentado no arquivo
// de que tabela (degraus) e equação contínua não são idênticas perto de
// fronteira de faixa de P-rem. Ambas as respostas são "corretas" dentro do
// próprio método -- não é um bug, é a divergência já documentada.
const row1Tabela = classifyPhosphorusCFSEMG1999(16.94, 24.31);
const row1Pr = classifyFosforoRelativoPercent(computeFosforoRelativo(16.94, 24.31).fosforoRelativoPercent);
assert.equal(row1Tabela.classification, "BOM");
assert.equal(row1Pr.classification, "BOM");

const row4Tabela = classifyPhosphorusCFSEMG1999(4.9, 12.67);
const row4Pr = classifyFosforoRelativoPercent(computeFosforoRelativo(4.9, 12.67).fosforoRelativoPercent);
assert.equal(row4Tabela.classification, "MUITO_BAIXO", "tabela (degrau) classifica este ponto como muito baixo");
assert.equal(row4Pr.classification, "BAIXO", "PR(%) contínuo classifica o MESMO ponto como baixo -- divergência esperada perto de fronteira");

console.log("phosphorus-engine: tabela CFSEMG 1999 + divergência tabela x contínuo documentada e testada");
console.log("phosphorus-engine: todos os cenários aprovados");
