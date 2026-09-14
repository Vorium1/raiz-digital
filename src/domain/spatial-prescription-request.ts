export type SpatialPrescriptionBlocker =
  | "FIELD_BOUNDARY_MISSING"
  | "RELIABLE_SAMPLE_COORDINATES_MISSING"
  | "SPATIAL_METHOD_POLICY_NOT_VALIDATED";

export type SpatialPrescriptionRequestInput = {
  explicitRequested: boolean;
  hasFieldBoundary: boolean;
  hasReliableSampleCoordinates: boolean;
  activeSpatialPolicyId?: string | null;
};

export type SpatialPrescriptionRequestDecision = {
  mode: "UNIFORM" | "VARIABLE_RATE";
  requested: boolean;
  canGenerateVariableRate: boolean;
  blockers: SpatialPrescriptionBlocker[];
};

/**
 * Taxa variável é uma capacidade sob demanda: nunca nasce automaticamente de
 * uma análise ou de uma recomendação uniforme. Mesmo quando o usuário pedir,
 * o sistema só pode avançar com limite do talhão, coordenadas confiáveis e
 * uma política espacial ACTIVE/homologada. Critérios de densidade de pontos,
 * interpolador, validação cruzada e tamanho mínimo de zona ficam fora daqui
 * até a política técnica ser formalmente validada.
 */
export function evaluateSpatialPrescriptionRequest(
  input: SpatialPrescriptionRequestInput,
): SpatialPrescriptionRequestDecision {
  if (!input.explicitRequested) {
    return {
      mode: "UNIFORM",
      requested: false,
      canGenerateVariableRate: false,
      blockers: [],
    };
  }

  const blockers: SpatialPrescriptionBlocker[] = [];
  if (!input.hasFieldBoundary) blockers.push("FIELD_BOUNDARY_MISSING");
  if (!input.hasReliableSampleCoordinates) blockers.push("RELIABLE_SAMPLE_COORDINATES_MISSING");
  if (!input.activeSpatialPolicyId?.trim()) blockers.push("SPATIAL_METHOD_POLICY_NOT_VALIDATED");

  return {
    mode: "VARIABLE_RATE",
    requested: true,
    canGenerateVariableRate: blockers.length === 0,
    blockers,
  };
}
