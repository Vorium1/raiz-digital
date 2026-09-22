export type ZarcAvailableWaterClass = "AD1" | "AD2" | "AD3" | "AD4" | "AD5" | "AD6";

export type ZarcAvailableWaterAssessment =
  | {
      status: "READY";
      availableWaterMmPerCm: number;
      availableWaterClass: ZarcAvailableWaterClass;
      zarcSoilCode: 11 | 12 | 13 | 14 | 15 | 16;
      sourceRule: "IN_SPA_MAPA_1_2022_AS_AMENDED_BY_IN_2_2022";
      depthFromCm: 0;
      depthToCm: 40;
      warnings: string[];
    }
  | {
      status: "INSUFFICIENT_GRANULOMETRY" | "DEPTH_NOT_APPLICABLE" | "GRANULOMETRY_NOT_CLOSED";
      availableWaterMmPerCm: null;
      availableWaterClass: null;
      zarcSoilCode: null;
      sourceRule: "IN_SPA_MAPA_1_2022_AS_AMENDED_BY_IN_2_2022";
      depthFromCm: number | null;
      depthToCm: number | null;
      warnings: string[];
    };

const ZARC_AD_CLASS_TO_SOIL_CODE: Record<ZarcAvailableWaterClass, 11 | 12 | 13 | 14 | 15 | 16> = {
  AD1: 11,
  AD2: 12,
  AD3: 13,
  AD4: 14,
  AD5: 15,
  AD6: 16,
};

function finitePercent(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function classifyZarcAvailableWater(adMmPerCm: number): ZarcAvailableWaterClass {
  if (!Number.isFinite(adMmPerCm) || adMmPerCm < 0.34) {
    throw new Error("ZARC_AVAILABLE_WATER_OUTSIDE_CLASSIFIED_RANGE");
  }
  if (adMmPerCm < 0.46) return "AD1";
  if (adMmPerCm < 0.61) return "AD2";
  if (adMmPerCm < 0.80) return "AD3";
  if (adMmPerCm < 1.06) return "AD4";
  if (adMmPerCm < 1.40) return "AD5";
  return "AD6";
}

/**
 * Função de pedotransferência oficial do ZARC para AD (mm/cm).
 *
 * Requisitos do normativo:
 * - areia total, silte e argila em %;
 * - granulometria da camada 0–40 cm;
 * - nenhuma fração pode ser inferida por diferença quando não foi medida.
 *
 * A pequena tolerância de fechamento (99–101%) serve apenas para arredondamento
 * laboratorial; fora dela, o cálculo não é executado.
 */
export function evaluateZarcAvailableWaterFromGranulometry(input: {
  totalSandPct?: number | null;
  siltPct?: number | null;
  clayPct?: number | null;
  depthFromCm?: number | null;
  depthToCm?: number | null;
}): ZarcAvailableWaterAssessment {
  const sourceRule = "IN_SPA_MAPA_1_2022_AS_AMENDED_BY_IN_2_2022" as const;
  const depthFromCm = input.depthFromCm ?? null;
  const depthToCm = input.depthToCm ?? null;

  if (depthFromCm !== 0 || depthToCm !== 40) {
    return {
      status: "DEPTH_NOT_APPLICABLE",
      availableWaterMmPerCm: null,
      availableWaterClass: null,
      zarcSoilCode: null,
      sourceRule,
      depthFromCm,
      depthToCm,
      warnings: ["ZARC_AD_REQUIRES_0_40_CM_GRANULOMETRY"],
    };
  }

  if (
    !finitePercent(input.totalSandPct)
    || !finitePercent(input.siltPct)
    || !finitePercent(input.clayPct)
  ) {
    return {
      status: "INSUFFICIENT_GRANULOMETRY",
      availableWaterMmPerCm: null,
      availableWaterClass: null,
      zarcSoilCode: null,
      sourceRule,
      depthFromCm,
      depthToCm,
      warnings: ["ZARC_AD_REQUIRES_MEASURED_SAND_SILT_AND_CLAY"],
    };
  }

  const totalSandPct = input.totalSandPct!;
  const siltPct = input.siltPct!;
  const clayPct = input.clayPct!;
  const total = totalSandPct + siltPct + clayPct;
  if (total < 99 || total > 101) {
    return {
      status: "GRANULOMETRY_NOT_CLOSED",
      availableWaterMmPerCm: null,
      availableWaterClass: null,
      zarcSoilCode: null,
      sourceRule,
      depthFromCm,
      depthToCm,
      warnings: ["ZARC_GRANULOMETRY_SUM_OUTSIDE_ROUNDING_TOLERANCE"],
    };
  }

  const inner =
    (-0.02128887 * totalSandPct)
    + (-0.01005814 * siltPct)
    + (-0.01901894 * clayPct)
    + (0.0001171219 * totalSandPct * siltPct)
    + (0.0002073924 * totalSandPct * clayPct)
    + (0.00006118707 * siltPct * clayPct)
    + (-0.000006373789 * totalSandPct * siltPct * clayPct);

  const base = 1 + (0.3591 * inner);
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error("ZARC_AVAILABLE_WATER_FORMULA_DOMAIN_INVALID");
  }

  const availableWaterMmPerCm = Math.pow(base, 2.78474) * 10;
  const availableWaterClass = classifyZarcAvailableWater(availableWaterMmPerCm);

  return {
    status: "READY",
    availableWaterMmPerCm,
    availableWaterClass,
    zarcSoilCode: ZARC_AD_CLASS_TO_SOIL_CODE[availableWaterClass],
    sourceRule,
    depthFromCm: 0,
    depthToCm: 40,
    warnings: availableWaterMmPerCm > 1.84
      ? ["ZARC_AD_ABOVE_1_84_REPRESENTED_AS_AD6"]
      : [],
  };
}
