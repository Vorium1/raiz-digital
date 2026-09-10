import assert from "node:assert/strict";
import { computeParameterPredominance } from "../src/domain/parameter-predominance.ts";

// Achado real do diretor (fechamento técnico Fase 3): este módulo NUNCA pode ser apresentado como
// "padrão espacial" -- ele só conta/proporciona classificação repetida na mesma coleta, sem ler
// coordenada, proximidade, vizinhança ou qualquer geometria. Os cenários abaixo provam isso de duas
// formas: (a) passar coordenadas nos pontos de entrada não muda o resultado em nada -- a função nem
// olha pra esses campos; (b) o objeto de saída nunca carrega latitude/longitude/distância/geometria.

function item(sampleCode, parameterCode, classification, extra = {}) {
  return { sampleCode, parameterCode, interpretable: true, classification, ...extra };
}

// 1. Sem observações -> nada reportado.
assert.deepEqual(computeParameterPredominance([]), []);

// 2. Uma única observação -> nunca predominância (piso mínimo de 3 pontos concordantes).
assert.deepEqual(computeParameterPredominance([item("P01", "P", "BAIXO")]), []);

// 3. Divergência real encontrada entre o texto da UI ("pelo menos 3 pontos com a mesma classificação")
// e a regra antiga (permitia reportar com só 2 de 3 concordando, 66.7% >= MIN_SHARE=0.6 antigo) --
// corrigida: 2 de 3 NUNCA é reportado agora, mesmo sendo maioria real (2 > 3/2), porque não atinge o
// piso absoluto de 3 pontos concordantes.
const twoOfThree = computeParameterPredominance([item("P01", "P", "BAIXO"), item("P02", "P", "BAIXO"), item("P03", "P", "MEDIO")]);
assert.deepEqual(twoOfThree, []);

// 4. 3 de 3 concordando -> predominância real (maioria + piso de 3 pontos).
const threeOfThree = computeParameterPredominance([item("P01", "P", "BAIXO"), item("P02", "P", "BAIXO"), item("P03", "P", "BAIXO")]);
assert.equal(threeOfThree.length, 1);
assert.equal(threeOfThree[0].matchingCount, 3);
assert.equal(threeOfThree[0].totalCount, 3);
assert.equal(threeOfThree[0].classification, "BAIXO");

// 5. 6 de 8 (exemplo do próprio pedido: "Baixo em 6 de 8 pontos avaliados") -> maioria real (6 > 4) e
// piso de 3 pontos concordantes -> reportado, com a contagem exata.
const sixOfEight = computeParameterPredominance([
  item("P01", "P", "BAIXO"), item("P02", "P", "BAIXO"), item("P03", "P", "BAIXO"),
  item("P04", "P", "BAIXO"), item("P05", "P", "BAIXO"), item("P06", "P", "BAIXO"),
  item("P07", "P", "ALTO"), item("P08", "P", "ALTO"),
]);
assert.equal(sixOfEight.length, 1);
assert.equal(sixOfEight[0].matchingCount, 6);
assert.equal(sixOfEight[0].totalCount, 8);

// 6. 4 de 10 concordando (>= piso de 3, mas 40% NÃO é maioria real) -> nunca reportado. Prova que o
// piso mínimo sozinho não basta -- as duas condições (maioria real E piso) precisam valer juntas.
const fourOfTen = computeParameterPredominance(
  Array.from({ length: 10 }, (_, i) => item(`P${i}`, "P", i < 4 ? "BAIXO" : `OUTRO_${i}`)),
);
assert.deepEqual(fourOfTen, []);

// 7. Itens não interpretáveis (sem classificação) nunca entram na contagem nem no denominador.
const withBlocked = computeParameterPredominance([
  item("P01", "P", "BAIXO"), item("P02", "P", "BAIXO"), item("P03", "P", "BAIXO"),
  { sampleCode: "P04", parameterCode: "P", interpretable: false, reason: "sem faixa homologada" },
]);
assert.equal(withBlocked.length, 1);
assert.equal(withBlocked[0].totalCount, 3); // não 4 -- o ponto bloqueado não conta como "avaliado"

// 8. PROVA CENTRAL DO FECHAMENTO: coordenadas/distância nos pontos de entrada não têm NENHUM efeito no
// resultado -- a função nem lê esses campos. "Dois pontos distantes" com a mesma classificação
// concordante produzem exatamente o mesmo resultado que dois pontos vizinhos -- porque não há análise
// de geometria nenhuma, em lugar nenhum deste módulo.
const distant = [
  item("P01", "P", "BAIXO", { latitude: -28.10, longitude: -51.10 }),
  item("P02", "P", "BAIXO", { latitude: 5.50, longitude: -60.90 }), // > 2.500 km de distância real
  item("P03", "P", "MEDIO", { latitude: -28.11, longitude: -51.11 }),
];
const near = [
  item("P01", "P", "BAIXO", { latitude: -28.100, longitude: -51.100 }),
  item("P02", "P", "BAIXO", { latitude: -28.101, longitude: -51.101 }),
  item("P03", "P", "MEDIO", { latitude: -28.102, longitude: -51.102 }),
];
assert.deepEqual(computeParameterPredominance(distant), computeParameterPredominance(near));
// E nenhum dos dois vira "predominância" mesmo assim (2 de 3, abaixo do piso) -- reforça que não existe
// nenhum caminho, com ou sem coordenada, pra este módulo declarar um "padrão espacial".
assert.deepEqual(computeParameterPredominance(distant), []);

// 9. O objeto de saída nunca carrega latitude/longitude/distância/geometria -- só contagem/proporção.
const resultKeys = Object.keys(threeOfThree[0]);
for (const forbidden of ["latitude", "longitude", "distance", "geometry", "coordinates", "neighbor", "spatial"]) {
  assert.ok(!resultKeys.includes(forbidden), `campo "${forbidden}" não deveria existir no resultado -- provaria uma análise espacial que este módulo não faz`);
}

console.log("parameter-predominance: 9 cenários aprovados (predominância de classificação -- nunca padrão espacial; coordenadas não afetam o resultado)");
