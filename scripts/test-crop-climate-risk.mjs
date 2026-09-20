import assert from "node:assert/strict";
import { assessCropClimateRisk } from "../src/domain/crop-climate-risk.ts";

const profiles = [
  {
    id: "TRIGO-RS-TEST",
    cropCode: "TRIGO",
    region: { countryCode: "BR", stateCodes: ["RS"] },
    rules: [
      {
        hazard: "EXCESS_RAIN",
        stages: ["FLOWERING", "GRAIN_FILL", "MATURATION", "HARVEST"],
        impact: "ADVERSE",
        severity: "HIGH",
        rationale: "Excesso de chuva em fases críticas aumenta risco agronômico e operacional.",
      },
      {
        hazard: "WATER_DEFICIT",
        stages: ["FLOWERING", "GRAIN_FILL"],
        impact: "ADVERSE",
        severity: "HIGH",
        rationale: "Déficit hídrico em fases reprodutivas pode limitar rendimento.",
      },
    ],
    source: { institution: "TEST", title: "Perfil técnico de teste — trigo RS" },
    status: "HOMOLOGATED",
  },
  {
    id: "TOMATE-RS-TEST",
    cropCode: "TOMATE",
    region: { countryCode: "BR", stateCodes: ["RS"] },
    rules: [
      {
        hazard: "HIGH_HUMIDITY",
        stages: ["FLOWERING", "FRUIT_SET"],
        impact: "ADVERSE",
        severity: "HIGH",
        rationale: "Umidade elevada pode aumentar risco fitossanitário no perfil testado.",
      },
      {
        hazard: "HEAT",
        stages: ["FLOWERING", "FRUIT_SET"],
        impact: "ADVERSE",
        severity: "MEDIUM",
        rationale: "Calor excessivo pode comprometer processos reprodutivos no perfil testado.",
      },
    ],
    source: { institution: "TEST", title: "Perfil técnico de teste — tomate RS" },
    status: "HOMOLOGATED",
  },
];

const excessRainSignal = {
  source: "INMET",
  publishedAt: "2026-09-20",
  targetStart: "2026-09-01",
  targetEnd: "2026-10-31",
  driver: "EL_NINO",
  confidence: "HIGH",
  hazards: [
    { hazard: "EXCESS_RAIN", confidence: "HIGH" },
    { hazard: "HIGH_HUMIDITY", confidence: "MEDIUM" },
  ],
};

const wheat = assessCropClimateRisk({
  cropCode: "TRIGO",
  countryCode: "BR",
  stateCode: "RS",
  plannedStart: "2026-09-10",
  plannedEnd: "2026-10-25",
  stages: ["GRAIN_FILL", "MATURATION"],
  signal: excessRainSignal,
  profiles,
});
assert.equal(wheat.status, "READY");
assert.equal(wheat.appliesToPlannedCropWindow, true);
assert.equal(wheat.riskClass, "ADVERSE");
assert.ok(wheat.impacts.some((item) => item.hazard === "EXCESS_RAIN"));

const tomato = assessCropClimateRisk({
  cropCode: "TOMATE",
  countryCode: "BR",
  stateCode: "RS",
  plannedStart: "2026-09-10",
  plannedEnd: "2026-10-25",
  stages: ["FLOWERING", "FRUIT_SET"],
  signal: excessRainSignal,
  profiles,
});
assert.equal(tomato.status, "READY");
assert.equal(tomato.appliesToPlannedCropWindow, true);
assert.equal(tomato.riskClass, "ADVERSE");
assert.ok(tomato.impacts.some((item) => item.hazard === "HIGH_HUMIDITY"));
assert.equal(tomato.impacts.some((item) => item.hazard === "EXCESS_RAIN"), false);

// A soja não pode herdar regra de trigo ou HF.
const soybeanNoProfile = assessCropClimateRisk({
  cropCode: "SOJA",
  countryCode: "BR",
  stateCode: "RS",
  plannedStart: "2026-09-10",
  plannedEnd: "2026-10-25",
  stages: ["FLOWERING"],
  signal: excessRainSignal,
  profiles,
});
assert.equal(soybeanNoProfile.status, "NO_APPLICABLE_PROFILE");
assert.equal(soybeanNoProfile.appliesToPlannedCropWindow, false);
assert.ok(soybeanNoProfile.warnings.includes("CROP_REGION_CLIMATE_PROFILE_REQUIRED"));

// Perfil de RS não pode ser usado silenciosamente em SC.
const wheatWrongState = assessCropClimateRisk({
  cropCode: "TRIGO",
  countryCode: "BR",
  stateCode: "SC",
  plannedStart: "2026-09-10",
  plannedEnd: "2026-10-25",
  stages: ["GRAIN_FILL"],
  signal: excessRainSignal,
  profiles,
});
assert.equal(wheatWrongState.status, "NO_APPLICABLE_PROFILE");

// O mesmo El Niño sem risco físico relevante para o estádio não gera conclusão.
const wheatHeatOnly = assessCropClimateRisk({
  cropCode: "TRIGO",
  countryCode: "BR",
  stateCode: "RS",
  plannedStart: "2026-09-10",
  plannedEnd: "2026-10-25",
  stages: ["GRAIN_FILL"],
  signal: {
    ...excessRainSignal,
    hazards: [{ hazard: "HEAT", confidence: "HIGH" }],
  },
  profiles,
});
assert.equal(wheatHeatOnly.status, "READY");
assert.equal(wheatHeatOnly.appliesToPlannedCropWindow, false);
assert.equal(wheatHeatOnly.riskClass, "NO_DEFINED_IMPACT");

// Previsão fora da janela de cultivo não deve interferir.
const outsideWindow = assessCropClimateRisk({
  cropCode: "TRIGO",
  countryCode: "BR",
  stateCode: "RS",
  plannedStart: "2026-09-10",
  plannedEnd: "2026-10-25",
  stages: ["GRAIN_FILL"],
  signal: {
    ...excessRainSignal,
    targetStart: "2027-01-01",
    targetEnd: "2027-02-28",
  },
  profiles,
});
assert.equal(outsideWindow.status, "OUTSIDE_FORECAST_WINDOW");
assert.equal(outsideWindow.appliesToPlannedCropWindow, false);

console.log("crop-climate-risk: cultura, região, estádio, janela e não-herança climática validados");
