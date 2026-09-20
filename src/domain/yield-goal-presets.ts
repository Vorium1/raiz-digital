export type YieldGoalPreset = {
  id: string;
  label: string;
  targetTonPerHa: number;
};

export type YieldGoalPresetConfig = {
  displayUnit: "sc/ha" | "t/ha" | "t MS/ha";
  sackKg?: number;
  presets: YieldGoalPreset[];
  helper: string;
};

function sacksRange(id: string, min: number, max: number, sackKg = 60): YieldGoalPreset {
  return {
    id,
    label: `${min}–${max} sc/ha`,
    targetTonPerHa: Number(((max * sackKg) / 1000).toFixed(2)),
  };
}

function tonsRange(id: string, min: number, max: number, unit: "t/ha" | "t MS/ha" = "t/ha"): YieldGoalPreset {
  return {
    id,
    label: `${min.toLocaleString("pt-BR")}–${max.toLocaleString("pt-BR")} ${unit}`,
    targetTonPerHa: max,
  };
}

const CONFIGS: Record<string, YieldGoalPresetConfig> = {
  SOJA: {
    displayUnit: "sc/ha",
    sackKg: 60,
    helper: "Faixas em sacas de 60 kg. Para o cálculo, a RAIZ usa o teto da faixa selecionada.",
    presets: [
      sacksRange("50-60", 50, 60),
      sacksRange("60-70", 60, 70),
      sacksRange("70-80", 70, 80),
      sacksRange("80-90", 80, 90),
      sacksRange("90-100", 90, 100),
    ],
  },
  MILHO: {
    displayUnit: "sc/ha",
    sackKg: 60,
    helper: "Faixas em sacas de 60 kg. Para o cálculo, a RAIZ usa o teto da faixa selecionada.",
    presets: [
      sacksRange("100-120", 100, 120),
      sacksRange("120-140", 120, 140),
      sacksRange("140-160", 140, 160),
      sacksRange("160-180", 160, 180),
      sacksRange("180-200", 180, 200),
      sacksRange("200-220", 200, 220),
    ],
  },
  TRIGO: {
    displayUnit: "sc/ha",
    sackKg: 60,
    helper: "Faixas em sacas de 60 kg. Para o cálculo, a RAIZ usa o teto da faixa selecionada.",
    presets: [
      sacksRange("40-50", 40, 50),
      sacksRange("50-60", 50, 60),
      sacksRange("60-70", 60, 70),
      sacksRange("70-80", 70, 80),
      sacksRange("80-90", 80, 90),
    ],
  },
  ARROZ: {
    displayUnit: "t/ha",
    helper: "Meta em toneladas por hectare. Para o cálculo, a RAIZ usa o teto da faixa selecionada.",
    presets: [
      tonsRange("6-7", 6, 7),
      tonsRange("7-8", 7, 8),
      tonsRange("8-9", 8, 9),
      tonsRange("9-10", 9, 10),
      tonsRange("10-11", 10, 11),
    ],
  },
  CANOLA: {
    displayUnit: "t/ha",
    helper: "Meta em toneladas por hectare. Para o cálculo, a RAIZ usa o teto da faixa selecionada.",
    presets: [
      tonsRange("1.5-2", 1.5, 2),
      tonsRange("2-2.5", 2, 2.5),
      tonsRange("2.5-3", 2.5, 3),
      tonsRange("3-3.5", 3, 3.5),
    ],
  },
  PASTAGEM_INVERNO: {
    displayUnit: "t MS/ha",
    helper: "Meta de matéria seca por hectare. Para o cálculo, a RAIZ usa o teto da faixa selecionada.",
    presets: [
      tonsRange("4-6", 4, 6, "t MS/ha"),
      tonsRange("6-8", 6, 8, "t MS/ha"),
      tonsRange("8-10", 8, 10, "t MS/ha"),
      tonsRange("10-12", 10, 12, "t MS/ha"),
    ],
  },
};

export function yieldGoalPresetConfig(cropCode: string | null | undefined): YieldGoalPresetConfig | null {
  const code = (cropCode ?? "").trim().toUpperCase();
  return CONFIGS[code] ?? null;
}

export function manualYieldToTonPerHa(
  cropCode: string | null | undefined,
  value: number,
): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const config = yieldGoalPresetConfig(cropCode);
  if (config?.displayUnit === "sc/ha") {
    return Number(((value * (config.sackKg ?? 60)) / 1000).toFixed(3));
  }
  return value;
}


export function displayYieldFromTonPerHa(
  cropCode: string | null | undefined,
  tonPerHa: number,
): number | null {
  if (!Number.isFinite(tonPerHa) || tonPerHa <= 0) return null;
  const config = yieldGoalPresetConfig(cropCode);
  if (config?.displayUnit === "sc/ha") {
    return Number(((tonPerHa * 1000) / (config.sackKg ?? 60)).toFixed(1));
  }
  return tonPerHa;
}
