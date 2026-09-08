/**
 * Motor de DOSE de fertilizante (kg/ha de P2O5 e K2O) -- MÓDULO SEPARADO do
 * motor de classificação (`agronomic-engine.ts`, que só diz "Baixo/Médio/
 * Alto") e do motor de calagem (`liming-engine.ts`). Zero-import, mesma
 * disciplina de dual-runtime dos outros dois módulos deste diretório.
 *
 * Fonte: Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), capítulo
 * 6.1 (Grãos) -- Tabela 6.1.2 (rendimento referência e manutenção),
 * Tabela 6.1.4 (regra de 1º/2º cultivo) e a tabela específica de cada
 * cultura (ex.: item 6.1.18, p.130, para soja). Conferido direto no PDF
 * oficial (extraído em `scratchpad/cqfs/manual.txt`) em 2026-09-08.
 *
 * A lógica da fonte, resumida: a dose de P2O5/K2O depende de 3 coisas ao
 * mesmo tempo -- (1) a classificação do solo pro nutriente (Muito Baixo a
 * Muito Alto), (2) se é o 1º ou 2º cultivo depois da análise (a correção
 * de solos pobres é parcelada em duas safras -- Tabela 6.1.4), e (3) a
 * expectativa de rendimento em relação ao "rendimento referência" da
 * cultura (rendimento maior soma uma dose extra por tonelada adicional).
 * Em nível "Muito Alto", a fonte deixa a dose entre 0 (não aplicar) e a
 * dose de manutenção "a critério do técnico responsável" -- por isso o
 * resultado aqui nunca inventa um valor único nesse caso, retorna a FAIXA
 * (0 até o teto) e marca `isDiscretionaryRange: true`.
 */

export type SoilNutrientLevel = "Muito Baixo" | "Baixo" | "Médio" | "Alto" | "Muito Alto";
export type CultivationYear = "PRIMEIRO" | "SEGUNDO";
export type Nutrient = "P2O5" | "K2O";

type LevelDose = { first: number; second: number } | { first: number; secondMax: number };

export type GrainDoseTable = {
  cropCode: string;
  /** Rendimento referência (t/ha) usado pra calcular a cultura -- Tabela 6.1.2. */
  referenceYieldTonPerHa: number;
  /** Dose adicional (kg/ha) por tonelada de grão acima do rendimento referência. */
  perExtraTon: { p2o5: number; k2o: number };
  p2o5: Record<SoilNutrientLevel, LevelDose>;
  k2o: Record<SoilNutrientLevel, LevelDose>;
  source: string;
};

const SOJA_SOURCE = "Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), item 6.1.18 (Soja), p.130 -- Fósforo e potássio, e Tabela 6.1.2, p.106 (rendimento referência e adubação de manutenção adicional).";

/**
 * Tabela real da soja (Glycine max), conferida contra o PDF oficial (item 6.1.18, p.130) e cruzada com a
 * Tabela 6.1.2 (p.106): rendimento referência 3 t/ha, manutenção 45 kg P2O5/ha e 75 kg K2O/ha -- bate
 * exatamente com os valores de "Alto" (1º e 2º cultivo) da tabela específica, confirmando consistência
 * interna da fonte entre as duas tabelas.
 */
export const SOJA_DOSE_TABLE: GrainDoseTable = {
  cropCode: "SOJA",
  referenceYieldTonPerHa: 3,
  perExtraTon: { p2o5: 15, k2o: 25 },
  p2o5: {
    "Muito Baixo": { first: 155, second: 95 },
    Baixo: { first: 95, second: 75 },
    Médio: { first: 85, second: 45 },
    Alto: { first: 45, second: 45 },
    "Muito Alto": { first: 0, secondMax: 45 },
  },
  k2o: {
    "Muito Baixo": { first: 155, second: 115 },
    Baixo: { first: 115, second: 95 },
    Médio: { first: 105, second: 75 },
    Alto: { first: 75, second: 75 },
    "Muito Alto": { first: 0, secondMax: 75 },
  },
  source: SOJA_SOURCE,
};

const MILHO_SOURCE = "Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), item 6.1.14 (Milho), p.127 -- Fósforo e potássio, e Tabela 6.1.2, p.106 (rendimento referência).";

/**
 * Tabela real do milho (Zea mays), conferida contra o PDF oficial (item 6.1.14, p.127). Rendimento
 * referência 6 t/ha (o dobro da soja) -- valores de dose e de incremento por tonelada extra são
 * distintos dos da soja, ambos extraídos direto da tabela específica da cultura, não reaproveitados.
 */
export const MILHO_DOSE_TABLE: GrainDoseTable = {
  cropCode: "MILHO",
  referenceYieldTonPerHa: 6,
  perExtraTon: { p2o5: 15, k2o: 10 },
  p2o5: {
    "Muito Baixo": { first: 200, second: 140 },
    Baixo: { first: 140, second: 120 },
    Médio: { first: 130, second: 90 },
    Alto: { first: 90, second: 90 },
    "Muito Alto": { first: 0, secondMax: 90 },
  },
  k2o: {
    "Muito Baixo": { first: 140, second: 100 },
    Baixo: { first: 100, second: 80 },
    Médio: { first: 90, second: 60 },
    Alto: { first: 60, second: 60 },
    "Muito Alto": { first: 0, secondMax: 60 },
  },
  source: MILHO_SOURCE,
};

const TRIGO_SOURCE = "Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), item 6.1.21 (Trigo), p.133 -- Fósforo e potássio, e Tabela 6.1.2, p.106 (rendimento referência).";

/**
 * Tabela real do trigo (Triticum aestivum), conferida contra o PDF oficial (item 6.1.21, p.133).
 * Rendimento referência 3 t/ha, mesmo incremento de P2O5 por tonelada extra da soja (15 kg/ha) mas
 * K2O diferente (10 kg/ha) -- valores conferidos individualmente, não assumidos por semelhança.
 */
export const TRIGO_DOSE_TABLE: GrainDoseTable = {
  cropCode: "TRIGO",
  referenceYieldTonPerHa: 3,
  perExtraTon: { p2o5: 15, k2o: 10 },
  p2o5: {
    "Muito Baixo": { first: 155, second: 95 },
    Baixo: { first: 95, second: 75 },
    Médio: { first: 85, second: 45 },
    Alto: { first: 45, second: 45 },
    "Muito Alto": { first: 0, secondMax: 45 },
  },
  k2o: {
    "Muito Baixo": { first: 110, second: 70 },
    Baixo: { first: 70, second: 50 },
    Médio: { first: 60, second: 30 },
    Alto: { first: 30, second: 30 },
    "Muito Alto": { first: 0, secondMax: 30 },
  },
  source: TRIGO_SOURCE,
};

/**
 * Nitrogênio pra milho e trigo NÃO está automatizado aqui de propósito: ao contrário do P2O5/K2O (uma
 * tabela simples de 5 níveis), a dose de N depende de várias dimensões ao mesmo tempo (teor de matéria
 * orgânica, tipo de cultura antecedente -- leguminosa/gramínea/consórcio --, densidade de plantas, e uma
 * regra não-linear extra pra rendimento muito alto, "aumentar de 20 a 40%", que a própria fonte deixa
 * como faixa, não valor único). Automatizar isso direito exige mais entrada de dado (histórico de cultura
 * anterior, densidade de semeadura) que a ficha de talhão ainda não captura -- registrado aqui como
 * próximo passo real, não implementado às pressas só pra "ter algo".
 */
export const NITROGEN_DOSE_NOTE =
  "Nitrogênio (milho/trigo): não calculado automaticamente nesta versão -- depende de matéria orgânica do solo, cultura antecedente (leguminosa/gramínea/consórcio) e densidade de plantas (milho), com regra adicional não-linear para rendimento muito alto. Consulte o Manual CQFS-RS/SC 2016, itens 6.1.14 (Milho, p.125) e 6.1.21 (Trigo, p.132), até esse cálculo ser automatizado.";

export type FertilizerDoseResult = {
  doseKgPerHa: number;
  isDiscretionaryRange: boolean;
  discretionaryRangeMax?: number;
  yieldAdjustmentKgPerHa: number;
  source: string;
};

/**
 * Calcula a dose de P2O5 ou K2O (kg/ha) pra uma cultura de grãos, dado o nível de disponibilidade no
 * solo, se é o 1º ou 2º cultivo após a análise, e a expectativa de rendimento real do talhão.
 * `expectedYieldTonPerHa` menor ou igual ao rendimento referência não desconta nada -- a fonte só soma
 * dose extra pra rendimento MAIOR, nunca subtrai pra rendimento menor.
 */
export function computeGrainFertilizerDose(
  table: GrainDoseTable,
  nutrient: Nutrient,
  level: SoilNutrientLevel,
  cultivationYear: CultivationYear,
  expectedYieldTonPerHa: number,
): FertilizerDoseResult {
  const bands = nutrient === "P2O5" ? table.p2o5 : table.k2o;
  const perTon = nutrient === "P2O5" ? table.perExtraTon.p2o5 : table.perExtraTon.k2o;
  const band = bands[level];

  const extraYield = Math.max(0, expectedYieldTonPerHa - table.referenceYieldTonPerHa);
  const yieldAdjustmentKgPerHa = Math.round(extraYield * perTon * 10) / 10;

  if (cultivationYear === "PRIMEIRO" || "second" in band) {
    const base = cultivationYear === "PRIMEIRO" ? band.first : (band as { first: number; second: number }).second;
    return {
      doseKgPerHa: Math.round((base + yieldAdjustmentKgPerHa) * 10) / 10,
      isDiscretionaryRange: false,
      yieldAdjustmentKgPerHa,
      source: table.source,
    };
  }

  const max = (band as { first: number; secondMax: number }).secondMax;
  return {
    doseKgPerHa: Math.round((max + yieldAdjustmentKgPerHa) * 10) / 10,
    isDiscretionaryRange: true,
    discretionaryRangeMax: Math.round((max + yieldAdjustmentKgPerHa) * 10) / 10,
    yieldAdjustmentKgPerHa,
    source: table.source,
  };
}

export type SulfurRecommendation = { applyKgPerHa: number; needed: boolean; source: string };

const SULFUR_SOURCE = "Manual de Calagem e Adubação CQFS-RS/SC, 11ª ed. (2016), item 6.1.18 (Soja), p.130 -- limiar fixo, não é faixa de classificação.";

/**
 * Enxofre pra soja: regra de limiar fixo (não é faixa de 5 níveis como P/K) -- se S < 10 mg/dm³, aplicar
 * 20 kg de S-SO4/ha; do contrário, não é necessário.
 */
export function computeSojaSulfurRecommendation(sulfurMgDm3: number): SulfurRecommendation {
  const needed = sulfurMgDm3 < 10;
  return { applyKgPerHa: needed ? 20 : 0, needed, source: SULFUR_SOURCE };
}

/**
 * Molibdênio pra soja: a fonte condiciona a recomendação a um SINTOMA VISUAL observado em campo
 * (amarelecimento generalizado por deficiência de N no início do desenvolvimento) além do pH -- não dá
 * pra calcular só com dado de laboratório, então este módulo NÃO tenta automatizar isso como faixa
 * numérica. Fica documentado aqui como texto, pra quem for montar a recomendação escrita incluir a
 * condição corretamente, sem inventar um gatilho que a fonte não define como puramente laboratorial.
 */
export const SOJA_MOLYBDENUM_NOTE =
  "Molibdênio: recomendado só em solos com pH(H2O) < 5,5 E sintoma visual de deficiência de N no início do desenvolvimento (amarelecimento generalizado das folhas) -- não é um limiar de laboratório isolado. Dose: 12-25 g Mo/ha via semente, ou 25-50 g Mo/ha via foliar (30-45 dias após emergência, sempre depois da inoculação). Fonte: Manual CQFS-RS/SC 2016, item 6.1.18, p.130.";
