import { buildRuleTrace, evaluateAgronomicRuleAutomation } from "./agronomic-rule-catalog.ts";
import type { BoundedDose, RicePkClass, RiceResponseClass } from "./research-ready-rules.ts";

export const RICE_K_SOSBAI_2025_PROFILE = "SOSBAI_2025_ARROZ_CONTINUO" as const;

const K_TABLE: Record<RicePkClass, Record<RiceResponseClass, BoundedDose>> = {
  MUITO_BAIXO: {
    MEDIA: { kind: "EXACT", kgPerHa: 100 },
    ALTA: { kind: "EXACT", kgPerHa: 120 },
    MUITO_ALTA: { kind: "EXACT", kgPerHa: 140 },
  },
  BAIXO: {
    MEDIA: { kind: "EXACT", kgPerHa: 80 },
    ALTA: { kind: "EXACT", kgPerHa: 100 },
    MUITO_ALTA: { kind: "EXACT", kgPerHa: 120 },
  },
  MEDIO: {
    MEDIA: { kind: "EXACT", kgPerHa: 60 },
    ALTA: { kind: "EXACT", kgPerHa: 80 },
    MUITO_ALTA: { kind: "EXACT", kgPerHa: 100 },
  },
  ALTO: {
    MEDIA: { kind: "EXACT", kgPerHa: 40 },
    ALTA: { kind: "EXACT", kgPerHa: 60 },
    MUITO_ALTA: { kind: "EXACT", kgPerHa: 80 },
  },
  MUITO_ALTO: {
    MEDIA: { kind: "UPPER_BOUND", maxKgPerHa: 40 },
    ALTA: { kind: "UPPER_BOUND", maxKgPerHa: 60 },
    MUITO_ALTA: { kind: "UPPER_BOUND", maxKgPerHa: 80 },
  },
};

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} deve ser um número finito maior ou igual a zero.`);
  }
}

function requireReadyRule() {
  const decision = evaluateAgronomicRuleAutomation("K-ARROZ-CONTINUO-SOSBAI-2025");
  if (!decision.allowed || !decision.rule) {
    throw new Error(`Regra K-ARROZ-CONTINUO-SOSBAI-2025 não está liberada para execução determinística (${decision.status}).`);
  }
  return buildRuleTrace("K-ARROZ-CONTINUO-SOSBAI-2025");
}

function applyCtcAdjustment(dose: BoundedDose, adjustmentKgPerHa: 0 | 20): BoundedDose {
  if (adjustmentKgPerHa === 0) return dose;
  if (dose.kind === "EXACT") {
    return { kind: "EXACT", kgPerHa: dose.kgPerHa + adjustmentKgPerHa };
  }
  return { kind: "UPPER_BOUND", maxKgPerHa: dose.maxKgPerHa + adjustmentKgPerHa };
}

/**
 * SOSBAI 2025, Tabela 4.7, p.48.
 *
 * Escopo fechado:
 * - arroz irrigado no perfil SOSBAI 2025;
 * - classe de K já produzida pelo perfil correto, pelo método Mehlich-1;
 * - coluna de expectativa de resposta explicitamente aprovada;
 * - CTC a pH 7,0 explícita em cmolc/dm3.
 *
 * A nota (1) da tabela determina acréscimo de 20 kg/ha de K2O somente quando
 * CTC pH 7,0 > 15,0 cmolc/dm3. CTC exatamente 15,0 não recebe o acréscimo.
 *
 * A classe Muito Alto continua sendo limite superior. A possível redução dos
 * valores para teores >=2x o crítico ou substituição pela exportação dos grãos
 * não é automatizada aqui, porque depende de contexto adicional e escolha
 * profissional. O parcelamento em doses altas/solos de baixa CTC também não é
 * transformado em regra automática nesta função.
 */
export function computeRiceContinuousPotassium(input: {
  profileId: string;
  potassiumClass: RicePkClass;
  classificationProfileId: string;
  potassiumMethod: "MEHLICH_1";
  responseClass: RiceResponseClass;
  responseClassApproved: boolean;
  ctcPh7CmolcPerDm3: number;
  ctcUnit: "cmolc/dm3";
}) {
  if (input.profileId !== RICE_K_SOSBAI_2025_PROFILE) {
    throw new Error("Perfil de arroz incompatível. A Tabela 4.7 da SOSBAI 2025 só pode ser usada no perfil explícito de arroz contínuo.");
  }
  if (input.classificationProfileId !== RICE_K_SOSBAI_2025_PROFILE) {
    throw new Error("Classe de K sem proveniência do perfil SOSBAI 2025 de arroz; não reutilizar classificação de outro sistema por analogia.");
  }
  if (input.potassiumMethod !== "MEHLICH_1") {
    throw new Error("Método incompatível para K do arroz: a Tabela 4.7 exige Mehlich-1.");
  }
  if (input.ctcUnit !== "cmolc/dm3") {
    throw new Error("Unidade incompatível para CTC pH 7,0; use cmolc/dm3 sem conversão implícita.");
  }
  if (input.responseClassApproved !== true) {
    throw new Error("A expectativa de resposta precisa estar explicitamente validada; meta ou nível de investimento não selecionam a coluna automaticamente.");
  }
  finiteNonNegative(input.ctcPh7CmolcPerDm3, "CTC pH 7,0");

  const trace = requireReadyRule();
  const baseDose = K_TABLE[input.potassiumClass][input.responseClass];
  const ctcAdjustmentKgPerHa: 0 | 20 = input.ctcPh7CmolcPerDm3 > 15 ? 20 : 0;
  const dose = applyCtcAdjustment(baseDose, ctcAdjustmentKgPerHa);

  return {
    ruleId: trace.ruleId,
    ruleVersion: trace.ruleVersion,
    sourceSnapshotId: trace.sourceSnapshotId,
    source: "SOSBAI 2025, Tabela 4.7, p.48; notas (1) e (2)",
    profileId: RICE_K_SOSBAI_2025_PROFILE,
    nutrient: "K2O" as const,
    potassiumClass: input.potassiumClass,
    responseClass: input.responseClass,
    potassiumMethod: "MEHLICH_1" as const,
    ctcPh7CmolcPerDm3: input.ctcPh7CmolcPerDm3,
    baseDose,
    ctcAdjustmentKgPerHa,
    dose,
    veryHighReductionAutomated: false as const,
    grainExportSubstitutionAutomated: false as const,
    splitApplicationAutomated: false as const,
    notes: [
      "Para teor de K >=2x o teor crítico, a SOSBAI admite reduzir a tabela ou aproximar a exportação pelos grãos; esta decisão não é automatizada.",
      "Parcelamento de doses altas em solo arenoso e/ou de baixa matéria orgânica é orientação condicional e permanece fora desta regra determinística.",
    ] as const,
  };
}
