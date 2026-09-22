import {
  BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026,
  evaluateBe8WheatVitalGlutenProtocol,
  type Be8WheatProtocolEvaluation,
} from "./wheat-buyer-quality-protocol.ts";

export const WHEAT_BUYER_QUALITY_PROTOCOL_IDS = [
  "BE8_WHEAT_VITAL_GLUTEN_2026",
] as const;

export type WheatBuyerQualityProtocolId = typeof WHEAT_BUYER_QUALITY_PROTOCOL_IDS[number];

export type WheatBuyerQualityContext = {
  protocolId: WheatBuyerQualityProtocolId | "";
  sowingBaseNitrogenKgN: number | null;
  seedRateKgPerHa: number | null;
  firstNitrogenApplicationKgN: number | null;
  firstNitrogenLatestStage: number | null;
  secondNitrogenProduct: string;
  secondNitrogenDisplayedAmountKg: number | null;
  secondNitrogenSourceAmountBasisConfirmed: boolean | null;
  fungalApplicationDeclared: boolean | null;
};

export const EMPTY_WHEAT_BUYER_QUALITY_CONTEXT: WheatBuyerQualityContext = {
  protocolId: "",
  sowingBaseNitrogenKgN: null,
  seedRateKgPerHa: null,
  firstNitrogenApplicationKgN: null,
  firstNitrogenLatestStage: null,
  secondNitrogenProduct: "",
  secondNitrogenDisplayedAmountKg: null,
  secondNitrogenSourceAmountBasisConfirmed: null,
  fungalApplicationDeclared: null,
};

function nullableFiniteNonNegative(value: unknown, label: string): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} deve ser um número finito maior ou igual a zero quando informado.`);
  }
  return number;
}

function nullableBoolean(value: unknown, label: string): boolean | null {
  if (value == null || value === "") return null;
  if (value === true || value === false) return value;
  throw new Error(`${label} deve ser verdadeiro, falso ou não informado.`);
}

function text(value: unknown, label: string, max = 160): string {
  if (value == null) return "";
  if (typeof value !== "string") throw new Error(`${label} deve ser texto.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${label} excede ${max} caracteres.`);
  return trimmed;
}

function protocolId(value: unknown): WheatBuyerQualityProtocolId | "" {
  if (value == null || value === "") return "";
  if (typeof value !== "string") throw new Error("Protocolo de comprador inválido.");
  const normalized = value.trim();
  if ((WHEAT_BUYER_QUALITY_PROTOCOL_IDS as readonly string[]).includes(normalized)) {
    return normalized as WheatBuyerQualityProtocolId;
  }
  throw new Error("Protocolo de comprador não homologado pelo RAIZ.");
}

/**
 * Parser do contexto opcional de comprador.
 *
 * O objeto pode existir mesmo sem protocolo selecionado para preservar rascunho,
 * mas nenhum protocolo é aplicado enquanto protocolId estiver vazio.
 */
export function parseWheatBuyerQualityContext(value: unknown): WheatBuyerQualityContext {
  if (value == null) return { ...EMPTY_WHEAT_BUYER_QUALITY_CONTEXT };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Contexto de qualidade/comprador do trigo inválido.");
  }
  const source = value as Record<string, unknown>;
  const stage = nullableFiniteNonNegative(source.firstNitrogenLatestStage, "Estádio limite da primeira aplicação de N");
  if (stage != null && !Number.isInteger(stage)) {
    throw new Error("Estádio limite da primeira aplicação de N deve ser inteiro quando informado.");
  }

  return {
    protocolId: protocolId(source.protocolId),
    sowingBaseNitrogenKgN: nullableFiniteNonNegative(source.sowingBaseNitrogenKgN, "N de base na semeadura"),
    seedRateKgPerHa: nullableFiniteNonNegative(source.seedRateKgPerHa, "Taxa de sementes"),
    firstNitrogenApplicationKgN: nullableFiniteNonNegative(source.firstNitrogenApplicationKgN, "Primeira aplicação de N"),
    firstNitrogenLatestStage: stage,
    secondNitrogenProduct: text(source.secondNitrogenProduct, "Produto da segunda aplicação de N"),
    secondNitrogenDisplayedAmountKg: nullableFiniteNonNegative(source.secondNitrogenDisplayedAmountKg, "Quantidade da segunda aplicação"),
    secondNitrogenSourceAmountBasisConfirmed: nullableBoolean(
      source.secondNitrogenSourceAmountBasisConfirmed,
      "Confirmação da base operacional da segunda aplicação",
    ),
    fungalApplicationDeclared: nullableBoolean(source.fungalApplicationDeclared, "Aplicação fúngica"),
  };
}

export type WheatBuyerQualityContextEvaluation =
  | {
      status: "NOT_SELECTED";
      protocolId: null;
      evaluation: null;
      policy: {
        blocksBaseNitrogenRecommendation: false;
        blocksSoilOpinion: false;
        buyerProtocolAutoSelected: false;
      };
    }
  | {
      status: "EVALUATED";
      protocolId: WheatBuyerQualityProtocolId;
      evaluation: Be8WheatProtocolEvaluation;
      source: typeof BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.source;
      policy: {
        blocksBaseNitrogenRecommendation: false;
        blocksSoilOpinion: false;
        buyerProtocolAutoSelected: false;
      };
    };

export function evaluateSelectedWheatBuyerQualityContext(
  context: WheatBuyerQualityContext,
): WheatBuyerQualityContextEvaluation {
  const policy = {
    blocksBaseNitrogenRecommendation: false as const,
    blocksSoilOpinion: false as const,
    buyerProtocolAutoSelected: false as const,
  };

  if (!context.protocolId) {
    return {
      status: "NOT_SELECTED",
      protocolId: null,
      evaluation: null,
      policy,
    };
  }

  if (context.protocolId === "BE8_WHEAT_VITAL_GLUTEN_2026") {
    return {
      status: "EVALUATED",
      protocolId: context.protocolId,
      source: BE8_WHEAT_VITAL_GLUTEN_PROTOCOL_2026.source,
      evaluation: evaluateBe8WheatVitalGlutenProtocol({
        sowingBaseNitrogenKgN: context.sowingBaseNitrogenKgN,
        seedRateKgPerHa: context.seedRateKgPerHa,
        firstNitrogenApplicationKgN: context.firstNitrogenApplicationKgN,
        firstNitrogenLatestStage: context.firstNitrogenLatestStage,
        secondNitrogenApplication: {
          product: context.secondNitrogenProduct || null,
          displayedAmountKg: context.secondNitrogenDisplayedAmountKg,
          sourceAmountBasisConfirmed: context.secondNitrogenSourceAmountBasisConfirmed,
        },
        fungalApplicationDeclared: context.fungalApplicationDeclared,
      }),
      policy,
    };
  }

  // Exaustividade defensiva se novos IDs forem adicionados sem evaluator.
  throw new Error("Protocolo de comprador selecionado ainda não possui avaliador homologado.");
}


export type StoredWheatBuyerQualityContextEvaluation =
  | WheatBuyerQualityContextEvaluation
  | {
      status: "NOT_APPLICABLE";
      protocolId: null;
      evaluation: null;
      policy: {
        blocksBaseNitrogenRecommendation: false;
        blocksSoilOpinion: false;
        buyerProtocolAutoSelected: false;
      };
    }
  | {
      status: "INVALID_OPTIONAL_EVIDENCE";
      protocolId: null;
      evaluation: null;
      limitations: string[];
      policy: {
        blocksBaseNitrogenRecommendation: false;
        blocksSoilOpinion: false;
        buyerProtocolAutoSelected: false;
      };
    };

/**
 * Leitura tolerante para JSONB persistido.
 * Contexto opcional inválido é isolado e nunca bloqueia N-base/laudo.
 */
export function evaluateStoredWheatBuyerQualityContext(
  value: unknown,
  cropProfileCode?: string | null,
): StoredWheatBuyerQualityContextEvaluation {
  const crop = cropProfileCode?.trim().toUpperCase() ?? "TRIGO";
  if (crop && crop !== "TRIGO") {
    return {
      status: "NOT_APPLICABLE",
      protocolId: null,
      evaluation: null,
      policy: {
        blocksBaseNitrogenRecommendation: false,
        blocksSoilOpinion: false,
        buyerProtocolAutoSelected: false,
      },
    };
  }

  try {
    return evaluateSelectedWheatBuyerQualityContext(parseWheatBuyerQualityContext(value));
  } catch (error) {
    return {
      status: "INVALID_OPTIONAL_EVIDENCE",
      protocolId: null,
      evaluation: null,
      limitations: [error instanceof Error ? error.message : "Contexto opcional de comprador inválido."],
      policy: {
        blocksBaseNitrogenRecommendation: false,
        blocksSoilOpinion: false,
        buyerProtocolAutoSelected: false,
      },
    };
  }
}
