import type {
  SoilMicrobiologyEvidenceFamily,
  SoilMicrobiologyFunctionalRole,
  SoilMicrobiologyMethodFamily,
  SoilMicrobiologyObservation,
} from "./soil-microbiology-evidence.ts";

export type BiologicalLabResultRow = {
  sampleCode: string;
  parameterCode: string;
  value: number;
  unit: string;
  method: string;
  protocol?: string | null;
  depthFromCm?: number | null;
  depthToCm?: number | null;
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function inferMethodFamily(parameterCode: string, method: string): SoilMicrobiologyMethodFamily {
  const code = normalized(parameterCode);
  const methodText = normalized(method);

  if (code === "BIOAS_BETA_GLUCOSIDASE" || code === "BIOAS_ARYLSULFATASE") return "ENZYME_ACTIVITY";
  if (code.startsWith("BIOAS_IQS_") || code.endsWith("_SCORE")) return "LAB_DERIVED_INDEX";
  if (code === "MICROBIO_BIOMASS_C") return "MICROBIAL_BIOMASS_C";
  if (code === "MICROBIO_BIOMASS_N") return "MICROBIAL_BIOMASS_N";
  if (code === "MICROBIO_BASAL_RESPIRATION") return "BASAL_RESPIRATION";
  if (code === "MICROBIO_QCO2") return "METABOLIC_QUOTIENT_QCO2";
  if (code === "MICROBIO_FDA_HYDROLYSIS") return "FDA_HYDROLYSIS";
  if (code === "MICROBIO_DEHYDROGENASE") return "DEHYDROGENASE_ACTIVITY";
  if (code === "MICROBIO_ACID_PHOSPHATASE" || code === "MICROBIO_ALKALINE_PHOSPHATASE") {
    return "PHOSPHATASE_ACTIVITY";
  }

  if (methodText.includes("QPCR")) return "QPCR";
  if (methodText.includes("16S") && (methodText.includes("METABAR") || methodText.includes("SEQUEN"))) return "METABARCODING_16S";
  if (methodText.includes("ITS") && (methodText.includes("METABAR") || methodText.includes("SEQUEN"))) return "METABARCODING_ITS";
  if (methodText.includes("PLFA")) return "PLFA";
  if (methodText.includes("FUMIG")) return "MICROBIAL_BIOMASS_C";
  if (methodText.includes("RESPIR")) return "BASAL_RESPIRATION";
  if (methodText.includes("DIACETATO") || methodText.includes("FDA")) return "FDA_HYDROLYSIS";
  if (methodText.includes("DESIDROGENASE")) return "DEHYDROGENASE_ACTIVITY";
  if (methodText.includes("FOSFATASE")) return "PHOSPHATASE_ACTIVITY";
  if (methodText.includes("NMP") || methodText.includes("MOST PROBABLE") || methodText.includes("NUMERO MAIS PROVAVEL")) return "MOST_PROBABLE_NUMBER";
  if (methodText.includes("UFC") || methodText.includes("COLONIA") || methodText.includes("MEIO SELETIVO")) return "CULTURE_COUNT_CFU";
  if (methodText.includes("MICORR") && methodText.includes("COLONIZ")) return "MYCORRHIZAL_COLONIZATION";
  if (methodText.includes("ESPOR")) return "SPORE_COUNT";
  return method.trim() ? "OTHER" : "UNKNOWN";
}

function classifyCode(parameterCode: string): {
  family: SoilMicrobiologyEvidenceFamily;
  role: SoilMicrobiologyFunctionalRole | null;
  organismOrTaxon: string | null;
} | null {
  const code = normalized(parameterCode);

  if (code === "BIOAS_BETA_GLUCOSIDASE") {
    return {
      family: "BIOAS_SOIL_HEALTH",
      role: "ORGANIC_MATTER_CYCLING",
      organismOrTaxon: null,
    };
  }
  if (code === "BIOAS_ARYLSULFATASE") {
    return {
      family: "BIOAS_SOIL_HEALTH",
      role: "SULFUR_CYCLING",
      organismOrTaxon: null,
    };
  }
  if (code.startsWith("BIOAS_IQS_") || code.startsWith("BIOAS_")) {
    return {
      family: "BIOAS_SOIL_HEALTH",
      role: null,
      organismOrTaxon: null,
    };
  }
  if (code === "MICROBIO_BIOMASS_C" || code === "MICROBIO_BIOMASS_N") {
    return { family: "MICROBIAL_BIOMASS", role: "ORGANIC_MATTER_CYCLING", organismOrTaxon: null };
  }
  if (code === "MICROBIO_BASAL_RESPIRATION" || code === "MICROBIO_QCO2") {
    return { family: "SOIL_RESPIRATION", role: "ORGANIC_MATTER_CYCLING", organismOrTaxon: null };
  }
  if (code === "MICROBIO_FDA_HYDROLYSIS" || code === "MICROBIO_DEHYDROGENASE") {
    return { family: "SOIL_ENZYME_ACTIVITY", role: "ORGANIC_MATTER_CYCLING", organismOrTaxon: null };
  }
  if (code === "MICROBIO_ACID_PHOSPHATASE" || code === "MICROBIO_ALKALINE_PHOSPHATASE") {
    return { family: "SOIL_ENZYME_ACTIVITY", role: "PHOSPHORUS_CYCLING", organismOrTaxon: null };
  }

  if (code.includes("AZOSPIRILLUM")) {
    return { family: "FUNCTIONAL_MICROORGANISM", role: "BIOLOGICAL_N_FIXATION", organismOrTaxon: "Azospirillum spp." };
  }
  if (code.includes("BRADYRHIZOBIUM")) {
    return { family: "INOCULANT_ORGANISM", role: "BIOLOGICAL_N_FIXATION", organismOrTaxon: "Bradyrhizobium spp." };
  }
  if (code.includes("RHIZOBIUM")) {
    return { family: "INOCULANT_ORGANISM", role: "BIOLOGICAL_N_FIXATION", organismOrTaxon: "Rhizobium spp." };
  }
  if (code.includes("DIAZOTRO") || code.includes("FIXADORESDE") || code.includes("BACTERIASFIXADORAS")) {
    return { family: "FUNCTIONAL_MICROORGANISM", role: "BIOLOGICAL_N_FIXATION", organismOrTaxon: null };
  }
  if (code.includes("SOLUBILIZ") && (code.includes("FOSFORO") || code.includes("FOSF") || code.endsWith("P"))) {
    return { family: "FUNCTIONAL_MICROORGANISM", role: "PHOSPHORUS_SOLUBILIZATION", organismOrTaxon: null };
  }
  if (code.includes("SOLUBILIZ") && (code.includes("POTASSIO") || code.includes("POTASS") || code.endsWith("K"))) {
    return { family: "FUNCTIONAL_MICROORGANISM", role: "POTASSIUM_SOLUBILIZATION", organismOrTaxon: null };
  }
  if (code.includes("MICORRIZ") || code.includes("MYCORRH")) {
    return { family: "MYCORRHIZA", role: "MYCORRHIZAL_P_UPTAKE", organismOrTaxon: null };
  }

  return null;
}

/**
 * Converte resultados laboratoriais já normalizados em evidência microbiológica
 * estruturada, sem inventar unidade, método, táxon ou função.
 *
 * O adapter reconhece apenas códigos inequívocos. O que não for reconhecido
 * continua preservado nos resultados brutos pelo pacote de evidências geral.
 */
export function adaptLabResultsToSoilMicrobiology(
  rows: BiologicalLabResultRow[],
): SoilMicrobiologyObservation[] {
  const observations: SoilMicrobiologyObservation[] = [];

  for (const row of rows) {
    if (!Number.isFinite(row.value) || row.value < 0) continue;
    const classification = classifyCode(row.parameterCode);
    if (!classification) continue;

    observations.push({
      parameterName: row.parameterCode,
      family: classification.family,
      functionalRole: classification.role,
      organismOrTaxon: classification.organismOrTaxon,
      value: row.value,
      unit: row.unit?.trim() || null,
      methodFamily: inferMethodFamily(row.parameterCode, row.method ?? ""),
      methodText: row.method?.trim() || null,
      protocolText: row.protocol?.trim() || null,
      depthFromCm: row.depthFromCm ?? null,
      depthToCm: row.depthToCm ?? null,
    });
  }

  return observations;
}
