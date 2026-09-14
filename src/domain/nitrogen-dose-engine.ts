export type NitrogenRuleStatus = "READY_FOR_IMPLEMENTATION" | "REQUIRES_AGRONOMIST_REVIEW";

export type NitrogenDose =
  | { kind: "EXACT"; kgNPerHa: number }
  | { kind: "RANGE"; minKgNPerHa: number; maxKgNPerHa: number }
  | { kind: "BLOCKED"; reason: string };

export type NitrogenRecommendation = {
  crop: "MILHO" | "TRIGO" | "CANOLA" | "PASTAGEM_INVERNO";
  ruleId: string;
  ruleVersion: string;
  sourceSnapshotId: string;
  status: NitrogenRuleStatus;
  dose: NitrogenDose;
  sowingRangeKgNPerHa: { min: number; max: number } | null;
  blockers: string[];
  notes: string[];
  source: string;
};

const SNAPSHOT = "RAIZ-WORK-RESEARCH-2026-09-14";
const VERSION = "1.0.0";

function finitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} deve ser maior que zero.`);
}

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} deve ser maior ou igual a zero.`);
}

function round1(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function omBand3(omPct: number): 0 | 1 | 2 {
  finiteNonNegative(omPct, "Matéria orgânica");
  return omPct <= 2.5 ? 0 : omPct <= 5 ? 1 : 2;
}

export function computeCornNitrogenRecommendation(input: {
  organicMatterPct: number;
  precedingClass: "LEGUME_OR_FALLOW" | "GRASS" | "GRASS_SUCCESSION";
  targetYieldTonPerHa: number;
  plannedPopulationPlantsPerHa: number;
  residueClass: "LEGUME" | "GRASS" | "UNKNOWN";
  residueBiomassTonPerHa?: number | null;
}): NitrogenRecommendation {
  const band = omBand3(input.organicMatterPct);
  finitePositive(input.targetYieldTonPerHa, "Meta produtiva");
  finitePositive(input.plannedPopulationPlantsPerHa, "População planejada");
  if (input.residueBiomassTonPerHa != null) finiteNonNegative(input.residueBiomassTonPerHa, "Biomassa de resíduo");

  const baseByPreceding = {
    LEGUME_OR_FALLOW: [70, 80, 90],
    GRASS: [50, 60, 70],
    GRASS_SUCCESSION: [40, 40, 50],
  } as const;
  const base = baseByPreceding[input.precedingClass][band];
  const yieldAdjustment = round1(Math.max(0, input.targetYieldTonPerHa - 6) * 15);
  const popDelta = Math.max(0, input.plannedPopulationPlantsPerHa - 65_000);
  const fullPopulationSteps = Math.floor(popDelta / 5_000);
  const populationAdjustment = fullPopulationSteps * 10;
  const blockers: string[] = [];
  const notes: string[] = [
    `Base CQFS para 6 t/ha: ${base} kg N/ha.`,
    `Ajuste por rendimento acima de 6 t/ha: ${yieldAdjustment} kg N/ha.`,
    `Ajuste por população: ${populationAdjustment} kg N/ha.`,
  ];

  if (popDelta % 5_000 !== 0) blockers.push("POPULATION_INCREMENT_NOT_EXACT_MULTIPLE");
  if (input.precedingClass === "GRASS_SUCCESSION") blockers.push("BASE_IS_UPPER_LIMIT_NOT_EXACT_DOSE");
  if (input.residueBiomassTonPerHa != null && (yieldAdjustment > 0 || populationAdjustment > 0)) {
    blockers.push("OVERLAPPING_HIGH_YIELD_BIOMASS_MODIFIERS_REQUIRE_REVIEW");
  }

  const sowingRangeKgNPerHa = input.residueClass === "GRASS"
    ? { min: 20, max: 40 }
    : input.residueClass === "LEGUME"
      ? { min: 10, max: 20 }
      : null;

  const computed = round1(base + yieldAdjustment + populationAdjustment);
  const dose: NitrogenDose = blockers.length === 0
    ? { kind: "EXACT", kgNPerHa: computed }
    : input.precedingClass === "GRASS_SUCCESSION" && blockers.length === 1
      ? { kind: "RANGE", minKgNPerHa: 0, maxKgNPerHa: computed }
      : { kind: "BLOCKED", reason: "A fonte não define uma combinação algorítmica única e segura para estes modificadores." };

  if (sowingRangeKgNPerHa) notes.push(`Faixa de N na semeadura: ${sowingRangeKgNPerHa.min}-${sowingRangeKgNPerHa.max} kg N/ha; restante em cobertura conforme o manejo publicado.`);

  return {
    crop: "MILHO",
    ruleId: "N-MILHO-CQFS-2016",
    ruleVersion: VERSION,
    sourceSnapshotId: SNAPSHOT,
    status: blockers.length === 0 ? "READY_FOR_IMPLEMENTATION" : "REQUIRES_AGRONOMIST_REVIEW",
    dose,
    sowingRangeKgNPerHa,
    blockers,
    notes,
    source: "CQFS-RS/SC 2016 pp.125-127",
  };
}

export function computeWheatNitrogenRecommendation(input: {
  organicMatterPct: number;
  precedingCrop: "SOY" | "CORN";
  targetYieldTonPerHa: number;
  lateQualityNitrogenRequested?: boolean;
}): NitrogenRecommendation {
  const band = omBand3(input.organicMatterPct);
  finitePositive(input.targetYieldTonPerHa, "Meta produtiva");
  const baseExact = input.precedingCrop === "SOY" ? [60, 40, 20] : [80, 60, 20];
  const base = baseExact[band];
  const perExtraTon = input.precedingCrop === "SOY" ? 20 : 30;
  const yieldAdjustment = round1(Math.max(0, input.targetYieldTonPerHa - 3) * perExtraTon);
  const blockers: string[] = [];
  const notes = [`Ajuste por rendimento acima de 3 t/ha: ${yieldAdjustment} kg N/ha.`];

  if (band === 2) blockers.push("BASE_IS_UPPER_LIMIT_WHEN_OM_ABOVE_5");
  if (input.lateQualityNitrogenRequested) blockers.push("LATE_QUALITY_N_REQUIRES_SPECIFIC_REVIEW");
  const total = round1(base + yieldAdjustment);
  const dose: NitrogenDose = band === 2
    ? { kind: "RANGE", minKgNPerHa: 0, maxKgNPerHa: total }
    : { kind: "EXACT", kgNPerHa: total };

  notes.push("Aplicar 15-20 kg N/ha na semeadura; restante entre perfilhamento e alongamento. N tardio para proteína não é default de produtividade.");

  return {
    crop: "TRIGO",
    ruleId: "N-TRIGO-EMBRAPA-2026",
    ruleVersion: VERSION,
    sourceSnapshotId: SNAPSHOT,
    status: blockers.length === 0 ? "READY_FOR_IMPLEMENTATION" : "REQUIRES_AGRONOMIST_REVIEW",
    dose,
    sowingRangeKgNPerHa: { min: 15, max: 20 },
    blockers,
    notes,
    source: "Embrapa Trigo 2026, Tabela 3, pp.29-33",
  };
}

export function computeCanolaNitrogenRecommendation(input: {
  organicMatterPct: number;
  targetYieldTonPerHa: number;
}): NitrogenRecommendation {
  const band = omBand3(input.organicMatterPct);
  finitePositive(input.targetYieldTonPerHa, "Meta produtiva");
  const base = [60, 40, 30][band];
  const yieldAdjustment = round1(Math.max(0, input.targetYieldTonPerHa - 1.5) * 20);
  const total = round1(base + yieldAdjustment);
  const blockers = band === 2 ? ["BASE_IS_UPPER_LIMIT_WHEN_OM_ABOVE_5"] : [];
  return {
    crop: "CANOLA",
    ruleId: "N-CANOLA-CQFS-2016",
    ruleVersion: VERSION,
    sourceSnapshotId: SNAPSHOT,
    status: blockers.length === 0 ? "READY_FOR_IMPLEMENTATION" : "REQUIRES_AGRONOMIST_REVIEW",
    dose: band === 2 ? { kind: "RANGE", minKgNPerHa: 0, maxKgNPerHa: total } : { kind: "EXACT", kgNPerHa: total },
    sowingRangeKgNPerHa: { min: 20, max: 30 },
    blockers,
    notes: [
      `Ajuste por rendimento acima de 1,5 t/ha: ${yieldAdjustment} kg N/ha.`,
      "Cobertura no estádio de quarta folha expandida; parcelamento depende de chuva, textura e risco de lixiviação.",
    ],
    source: "CQFS-RS/SC 2016 p.119; Embrapa Trigo/Tomm et al. 2009 pp.50-53",
  };
}

function pastureBaseRange(omPct: number): { min: number; max: number } {
  finiteNonNegative(omPct, "Matéria orgânica");
  if (omPct < 1.6) return { min: 160, max: 180 };
  if (omPct <= 2.5) return { min: 140, max: 160 };
  if (omPct <= 3.5) return { min: 120, max: 140 };
  if (omPct <= 4.5) return { min: 100, max: 120 };
  return { min: 80, max: 100 };
}

export function computeWinterPastureNitrogenRecommendation(input: {
  organicMatterPct: number;
  pastureType: "ANNUAL_GRASS" | "PERENNIAL_GRASS" | "LEGUME";
  targetDryMatterTonPerHa: number;
  precedingLegume: boolean;
  effectiveLegumeInoculation?: boolean;
  provenLegumeInoculationFailure?: boolean;
  numberOfUses?: number | null;
}): NitrogenRecommendation {
  finitePositive(input.targetDryMatterTonPerHa, "Rendimento de matéria seca");
  if (input.numberOfUses != null) finiteNonNegative(input.numberOfUses, "Número de usos");

  if (input.pastureType === "LEGUME") {
    if (input.effectiveLegumeInoculation === true) {
      return {
        crop: "PASTAGEM_INVERNO",
        ruleId: "N-GRAMINEA-INVERNO-CQFS-2016",
        ruleVersion: VERSION,
        sourceSnapshotId: SNAPSHOT,
        status: "READY_FOR_IMPLEMENTATION",
        dose: { kind: "EXACT", kgNPerHa: 0 },
        sowingRangeKgNPerHa: null,
        blockers: [],
        notes: ["Pastagem leguminosa com inoculação eficaz não recebe N pela regra pesquisada."],
        source: "CQFS-RS/SC 2016 pp.141-147",
      };
    }
    if (input.provenLegumeInoculationFailure === true && input.numberOfUses != null) {
      const dose = 20 * Math.floor(input.numberOfUses / 2);
      return {
        crop: "PASTAGEM_INVERNO",
        ruleId: "N-GRAMINEA-INVERNO-CQFS-2016",
        ruleVersion: VERSION,
        sourceSnapshotId: SNAPSHOT,
        status: "READY_FOR_IMPLEMENTATION",
        dose: { kind: "EXACT", kgNPerHa: dose },
        sowingRangeKgNPerHa: null,
        blockers: [],
        notes: ["Falha de inoculação comprovada: 20 kg N/ha após cada dois usos."],
        source: "CQFS-RS/SC 2016 pp.141-147",
      };
    }
    return {
      crop: "PASTAGEM_INVERNO",
      ruleId: "N-GRAMINEA-INVERNO-CQFS-2016",
      ruleVersion: VERSION,
      sourceSnapshotId: SNAPSHOT,
      status: "REQUIRES_AGRONOMIST_REVIEW",
      dose: { kind: "BLOCKED", reason: "Leguminosa exige confirmação da inoculação ou falha comprovada antes de qualquer N." },
      sowingRangeKgNPerHa: null,
      blockers: ["LEGUME_INOCULATION_STATUS_REQUIRED"],
      notes: [],
      source: "CQFS-RS/SC 2016 pp.141-147",
    };
  }

  const base = pastureBaseRange(input.organicMatterPct);
  const reference = input.pastureType === "ANNUAL_GRASS" ? 6 : 8;
  const extra = round1(Math.max(0, input.targetDryMatterTonPerHa - reference) * 30);
  const min = round1(base.min + extra);
  const max = round1(base.max + extra);
  const dose: NitrogenDose = input.precedingLegume
    ? { kind: "EXACT", kgNPerHa: min }
    : { kind: "RANGE", minKgNPerHa: min, maxKgNPerHa: max };
  return {
    crop: "PASTAGEM_INVERNO",
    ruleId: "N-GRAMINEA-INVERNO-CQFS-2016",
    ruleVersion: VERSION,
    sourceSnapshotId: SNAPSHOT,
    status: "READY_FOR_IMPLEMENTATION",
    dose,
    sowingRangeKgNPerHa: { min: 15, max: 30 },
    blockers: [],
    notes: [
      `Referência de matéria seca: ${reference} t MS/ha; incremento: ${extra} kg N/ha.`,
      input.precedingLegume ? "Após leguminosa, a fonte manda usar o limite inferior da faixa." : "A fonte fornece faixa; o motor não interpola silenciosamente dentro dela.",
      "O restante deve ser parcelado em 2-4 coberturas no perfilhamento e após usos, conforme o manejo publicado.",
    ],
    source: "CQFS-RS/SC 2016 pp.141-147",
  };
}
