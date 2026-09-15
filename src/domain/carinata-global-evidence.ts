import {
  evaluateAgronomicEvidenceTransfer,
  type AgronomicEvidenceTransferDecision,
} from "@/domain/agronomic-evidence-transferability";

export type CarinataEvidenceObservation = {
  sourceId: string;
  sourceType: "PEER_REVIEWED_FIELD_TRIAL" | "MULTISITE_FIELD_TRIAL" | "NUTRIENT_UPTAKE_STUDY" | "EXTENSION_GUIDE";
  title: string;
  year: number;
  doiOrUrl: string;
  context: string;
  observation: string;
  quantitativePrescriptionAllowed: false;
};

export type CarinataTargetContext = {
  crop: "CARINATA";
  waterRegime: "RAINFED" | "IRRIGATED" | "UNKNOWN";
  soilTextureGroup: "LOAMY_SAND" | "SANDY_LOAM" | "SANDY_CLAY_LOAM" | "OTHER" | "UNKNOWN";
  soilPH: number | null;
};

export const CARINATA_EVIDENCE_OBSERVATIONS: readonly CarinataEvidenceObservation[] = Object.freeze([
  {
    sourceId: "CARINATA-N-SD-2019",
    sourceType: "PEER_REVIEWED_FIELD_TRIAL",
    title: "Nitrogen Requirements of Ethiopian Mustard for Biofuel Feedstock in South Dakota",
    year: 2019,
    doiOrUrl: "https://doi.org/10.2134/agronj2018.06.0419",
    context: "Dois locais em South Dakota, 2015–2016; 0, 28, 56, 84 e 140 kg N/ha.",
    observation: "Rendimento de sementes e óleo atingiram pico no tratamento de 84 kg N/ha; EONR reportada de 60–81 kg N/ha. Resultado é específico do ambiente experimental e não é dose RAIZ para o Brasil.",
    quantitativePrescriptionAllowed: false,
  },
  {
    sourceId: "CARINATA-N-FL-2019",
    sourceType: "PEER_REVIEWED_FIELD_TRIAL",
    title: "Carinata Dry Matter Accumulation and Nutrient Uptake Responses to Nitrogen Fertilization",
    year: 2019,
    doiOrUrl: "https://doi.org/10.2134/agronj2018.10.0678",
    context: "Quincy, norte da Flórida; solo sandy loam; 0, 45, 90 e 135 kg N/ha; estudo de dois anos.",
    observation: "Máximo modelado de rendimento em 102,3 kg N/ha e EONR de 93 kg N/ha. Pico de absorção de N ocorreu entre 50% de bolting e 50% de florescimento.",
    quantitativePrescriptionAllowed: false,
  },
  {
    sourceId: "CARINATA-N-S-SD-2021",
    sourceType: "PEER_REVIEWED_FIELD_TRIAL",
    title: "Nitrogen and sulfur fertilizers effects on growth and yield of Brassica carinata in South Dakota",
    year: 2021,
    doiOrUrl: "https://doi.org/10.1002/agj2.20501",
    context: "Brookings, South Dakota, 2017–2018; N 56–140 kg/ha; S 0, 22 e 45 kg/ha.",
    observation: "Rendimento de semente e óleo atingiu pico no tratamento de 112 kg N/ha; S elevou rendimento e teor de óleo e a ausência de S reduziu resposta ao N. EONR reportada de 47–93 kg N/ha e EOSR de 20–26 kg S/ha.",
    quantitativePrescriptionAllowed: false,
  },
  {
    sourceId: "CARINATA-N-COASTAL-PLAIN-2021",
    sourceType: "MULTISITE_FIELD_TRIAL",
    title: "Brassica carinata biomass, yield, and seed chemical composition response to nitrogen rates and timing on southern Coastal Plain soils in the United States",
    year: 2021,
    doiOrUrl: "https://doi.org/10.1111/gcbb.12846",
    context: "Cinco site-years em Florida/Georgia; não irrigado; loamy sand, sandy loam e sandy clay loam; pH dos sítios reportados entre 5,8 e 6,4; N 0–179 kg/ha.",
    observation: "Rendimento respondeu linearmente até 134 kg N/ha no domínio testado. No estudo de timing em três sítios da Georgia, duas aplicações (plantio + pré-bolting) foram economicamente superiores; EONR mediana estimada em 130 kg N/ha, intervalo crível central de 116–152 kg N/ha.",
    quantitativePrescriptionAllowed: false,
  },
  {
    sourceId: "CARINATA-UPTAKE-FL-NC-2023",
    sourceType: "NUTRIENT_UPTAKE_STUDY",
    title: "Brassica carinata nutrient accumulation and partitioning across maturity types and latitude",
    year: 2023,
    doiOrUrl: "https://doi.org/10.1002/csc2.20900",
    context: "Quatro site-years em Florida e North Carolina; diferentes solos, latitudes e genótipos.",
    observation: "Quantificou acúmulo e partição de N, P, K, S, Zn e B. Valores de acúmulo da planta descrevem demanda/remoção e NÃO equivalem à dose de fertilizante necessária.",
    quantitativePrescriptionAllowed: false,
  },
  {
    sourceId: "CARINATA-UF-IFAS-GUIDE",
    sourceType: "EXTENSION_GUIDE",
    title: "Carinata, the Sustainable Crop for a Bio-based Economy: Production Recommendations for the Southeastern United States",
    year: 2026,
    doiOrUrl: "https://ask.ifas.ufl.edu/publication/AG389",
    context: "Guia de extensão para o Sudeste dos EUA, baseado em pesquisa regional; recomenda análise de solo e usa canola como referência para P/K.",
    observation: "Indica bom desenvolvimento em solos bem drenados com pH 5,5–6,5; apresenta manejo de N/S parcelado e critérios de risco para B em solos grosseiros/arenosos com pH >7 ou seca prolongada. Essas recomendações não são automaticamente transferidas para RS/SC.",
    quantitativePrescriptionAllowed: false,
  },
]);

const COASTAL_PLAIN_N_PROFILE = {
  evidenceType: "MULTILOCATION_TRIAL" as const,
  evidenceStrength: "TRANSFERRED_STRONG" as const,
  constraints: {
    crop: { kind: "CATEGORICAL" as const, allowed: ["CARINATA"] },
    waterRegime: { kind: "CATEGORICAL" as const, allowed: ["RAINFED"] },
    soilTextureGroup: {
      kind: "CATEGORICAL" as const,
      allowed: ["LOAMY_SAND", "SANDY_LOAM", "SANDY_CLAY_LOAM"],
    },
    soilPH: { kind: "NUMERIC_RANGE" as const, min: 5.8, max: 6.4, unit: "pH 1:1 soil:water (site characterization)" },
  },
  criticalDimensions: ["crop", "waterRegime", "soilTextureGroup", "soilPH"] as const,
  requiresLocalCalibration: true,
  requiresAgronomistReview: true,
  quantitativeUseStatus: "REVIEW_ONLY" as const,
  quantitativeApplicabilityApproved: false,
  homologatedRuleId: null,
};

/**
 * Compara o contexto do campo somente com o domínio observado no ensaio
 * multissítio FL/GA de Bashyal et al. (2021). O intervalo de pH aqui é o
 * intervalo dos sítios do estudo, não uma faixa de suficiência inventada.
 * A decisão nunca libera dose: o perfil permanece REVIEW_ONLY.
 */
export function evaluateCarinataCoastalPlainNitrogenEvidence(
  target: CarinataTargetContext,
): AgronomicEvidenceTransferDecision {
  return evaluateAgronomicEvidenceTransfer(COASTAL_PLAIN_N_PROFILE, target);
}

export function buildCarinataNutrientEvidenceBrief() {
  return {
    crop: "CARINATA" as const,
    evidenceState: "GLOBAL_EVIDENCE_AVAILABLE_LOCAL_CALIBRATION_INCOMPLETE" as const,
    priorities: {
      nitrogen: "MULTIPLE_FIELD_TRIALS_SHOW_RESPONSE_CONTEXT_DEPENDENT" as const,
      sulfur: "REPEATED_EVIDENCE_OF_IMPORTANCE_AND_N_S_INTERACTION" as const,
      phosphorus: "UPTAKE_KNOWN_DIRECT_LOCAL_RATE_CALIBRATION_LIMITED" as const,
      potassium: "UPTAKE_KNOWN_DIRECT_LOCAL_RATE_CALIBRATION_LIMITED" as const,
      boron: "DEFICIENCY_RISK_AND_UPTAKE_EVIDENCE_EXISTS_RATE_TRANSFER_REQUIRES_REVIEW" as const,
      zinc: "UPTAKE_EVIDENCE_EXISTS_RATE_TRANSFER_REQUIRES_REVIEW" as const,
    },
    importantInterpretationRules: [
      "Nutrient uptake or removal is not fertilizer requirement.",
      "A rate that maximized yield in one trial is not a universal recommendation.",
      "N and S responses interact; a nitrogen rule must not ignore sulfur status when the applicable evidence requires it.",
      "P and K should remain tied to validated soil-test interpretation; canola analogy is evidence for review, not an automatic carinata dose rule.",
      "Boron has a narrow safety margin; deficiency-risk guidance must not become blanket application.",
      "Local field history can increase or reduce the relevance of transferred evidence.",
    ] as const,
    automaticDoseAllowed: false as const,
    canolaAnalogyAutomaticDoseAllowed: false as const,
    professionalReviewRequiredForTransferredRates: true as const,
    sources: CARINATA_EVIDENCE_OBSERVATIONS,
  };
}
