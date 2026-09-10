export type ParameterCrossValidationRequest = {
  cropName: string;
  cropCode: string;
  parameterCode: string;
  parameterCategory: string;
  sampleType: string;
  depthFromCm: number | null;
  depthToCm: number | null;
  unitExpected: string | null;
  analyticalMethodAllowed: string[];
  sufficiencyRanges: Array<{ label: string; min?: number; max?: number }>;
};

export type ParameterCrossValidationResult = {
  /** CONSISTENTE = a IA encontrou a mesma faixa (ou equivalente) em literatura reconhecida.
   * INCONSISTENTE = a IA encontrou divergência real -- precisa de atenção extra do curador antes de homologar.
   * INDETERMINADO = a IA não tem base suficiente pra opinar (nunca inventa consenso quando não há um). */
  status: "CONSISTENTE" | "INCONSISTENTE" | "INDETERMINADO";
  confidence: number;
  summary: string;
  sources: Array<{ title: string; institution: string | null }>;
  provider: string;
  model: string;
  isRealLanguageModel: boolean;
};

export interface ParameterCrossValidationProvider {
  readonly name: string;
  readonly model: string;
  readonly isRealLanguageModel: boolean;
  crossValidate(request: ParameterCrossValidationRequest): Promise<ParameterCrossValidationResult>;
}
