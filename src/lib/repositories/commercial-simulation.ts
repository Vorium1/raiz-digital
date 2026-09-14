import {
  computeSingleProductRateFromNutrient,
  convertLimingRequirementToCommercialProduct,
  solveTwoProductPkPlan,
  type CommercialFertilizerProduct,
  type CommercialNutrient,
} from "@/domain/commercial-input-engine";
import { deriveCommercialTargets } from "@/domain/commercial-recommendation-targets";
import { getAnalysisById } from "@/lib/repositories/analyses";
import { listCommercialInputProducts, type CommercialInputProduct } from "@/lib/repositories/commercial-input-products";
import { getCurrentInputComparisonForAnalysis } from "@/lib/repositories/input-comparison";

export type CommercialSimulationMode = "SINGLE" | "PK_PAIR" | "LIME";

export class CommercialSimulationError extends Error {
  constructor(message: string, readonly status = 422, readonly details?: unknown) {
    super(message);
    this.name = "CommercialSimulationError";
  }
}

function asEngineProduct(product: CommercialInputProduct): CommercialFertilizerProduct {
  return {
    code: product.code,
    name: product.name,
    guaranteesPercent: product.guaranteesPercent,
    pricePerTon: product.pricePerTon,
    minRateKgPerHa: product.minRateKgPerHa,
    maxRateKgPerHa: product.maxRateKgPerHa,
  };
}

function requireProduct(products: CommercialInputProduct[], productId: string, kind?: "FERTILIZER" | "LIMESTONE") {
  const product = products.find((item) => item.id === productId && item.active);
  if (!product) throw new CommercialSimulationError("Produto comercial ativo não encontrado.", 404);
  if (kind && product.kind !== kind) {
    throw new CommercialSimulationError(kind === "LIMESTONE" ? "Selecione um calcário ativo para esta conversão." : "Selecione um fertilizante ativo para esta simulação.", 422);
  }
  return product;
}

export async function getCommercialSimulationWorkspace(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
}) {
  const [analysis, comparison, products] = await Promise.all([
    getAnalysisById(input.tenantId, input.analysisId, input.userId),
    getCurrentInputComparisonForAnalysis(input.tenantId, input.analysisId, input.userId),
    listCommercialInputProducts(input.tenantId, input.userId),
  ]);
  if (!analysis) throw new CommercialSimulationError("Análise não encontrada.", 404);

  const targets = deriveCommercialTargets(comparison.map((row) => ({
    inputType: row.inputType,
    recommendedQuantity: row.recommendedQuantity,
    recommendedUnit: row.recommendedUnit,
    recommendationCurrent: row.recommendationCurrent,
    recommendationCurrentReason: row.recommendationCurrentReason,
  })));

  return {
    analysisId: input.analysisId,
    analysisCode: String(analysis.code),
    areaHa: Number(analysis.areaHa),
    targets,
    products: products.filter((product) => product.active),
  };
}

function limestoneConstraintViolations(product: CommercialInputProduct, productDoseKgPerHa: number) {
  const violations: string[] = [];
  if (product.minRateKgPerHa != null && productDoseKgPerHa < product.minRateKgPerHa - 1e-9) {
    violations.push(`Dose calculada ${productDoseKgPerHa.toFixed(2)} kg/ha abaixo do mínimo operacional cadastrado de ${product.minRateKgPerHa} kg/ha.`);
  }
  if (product.maxRateKgPerHa != null && productDoseKgPerHa > product.maxRateKgPerHa + 1e-9) {
    violations.push(`Dose calculada ${productDoseKgPerHa.toFixed(2)} kg/ha acima do máximo operacional cadastrado de ${product.maxRateKgPerHa} kg/ha.`);
  }
  return violations;
}

/**
 * Simulação comercial é deliberadamente read-only: não altera `input_recommendations`, não aprova
 * prescrição e não escolhe produto automaticamente. O produto é uma decisão explícita do usuário e
 * os alvos vêm apenas das recomendações oficiais que ainda são correntes.
 */
export async function simulateCommercialPlan(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  mode: CommercialSimulationMode;
  productId?: string | null;
  productAId?: string | null;
  productBId?: string | null;
  driverNutrient?: CommercialNutrient | null;
}) {
  const workspace = await getCommercialSimulationWorkspace(input);
  const { targets, products, areaHa } = workspace;

  if (input.mode === "SINGLE") {
    if (!input.productId) throw new CommercialSimulationError("Selecione um produto.", 400);
    if (!input.driverNutrient) throw new CommercialSimulationError("Selecione o nutriente-guia.", 400);
    const target = targets.nutrientTargetsKgPerHa[input.driverNutrient];
    if (target == null) {
      throw new CommercialSimulationError(`Não existe recomendação oficial corrente de ${input.driverNutrient} em kg/ha para esta análise.`, 422);
    }
    const product = requireProduct(products, input.productId, "FERTILIZER");
    try {
      const result = computeSingleProductRateFromNutrient({
        product: asEngineProduct(product),
        driverNutrient: input.driverNutrient,
        targetKgPerHa: target,
        allTargetsKgPerHa: targets.nutrientTargetsKgPerHa,
        areaHa,
      });
      return {
        mode: input.mode,
        driverNutrient: input.driverNutrient,
        targetKgPerHa: target,
        productId: product.id,
        result,
        sourceTargets: targets.sourceRows,
      } as const;
    } catch (error) {
      throw new CommercialSimulationError(error instanceof Error ? error.message : "Falha ao simular o produto.", 422);
    }
  }

  if (input.mode === "PK_PAIR") {
    if (!input.productAId || !input.productBId) throw new CommercialSimulationError("Selecione os dois produtos para a combinação P/K.", 400);
    if (input.productAId === input.productBId) throw new CommercialSimulationError("A combinação P/K precisa de dois produtos distintos.", 422);
    const targetP = targets.nutrientTargetsKgPerHa.P2O5;
    const targetK = targets.nutrientTargetsKgPerHa.K2O;
    if (targetP == null || targetK == null) {
      throw new CommercialSimulationError("A combinação P/K exige recomendações oficiais correntes de P2O5 e K2O, ambas em kg/ha.", 422);
    }
    const productA = requireProduct(products, input.productAId, "FERTILIZER");
    const productB = requireProduct(products, input.productBId, "FERTILIZER");
    try {
      const result = solveTwoProductPkPlan({
        productA: asEngineProduct(productA),
        productB: asEngineProduct(productB),
        targetP2O5KgPerHa: targetP,
        targetK2OKgPerHa: targetK,
        additionalTargetsKgPerHa: targets.nutrientTargetsKgPerHa,
        areaHa,
      });
      return {
        mode: input.mode,
        productAId: productA.id,
        productBId: productB.id,
        targetsKgPerHa: { P2O5: targetP, K2O: targetK },
        result,
        sourceTargets: targets.sourceRows,
      } as const;
    } catch (error) {
      throw new CommercialSimulationError(error instanceof Error ? error.message : "Falha ao resolver a combinação P/K.", 422);
    }
  }

  if (!input.productId) throw new CommercialSimulationError("Selecione um calcário.", 400);
  const requirement = targets.limingRequirementTonPerHaPrnt100;
  if (requirement == null) {
    throw new CommercialSimulationError("Não existe necessidade oficial corrente de calcário equivalente a PRNT100 em t/ha para esta análise.", 422);
  }
  const product = requireProduct(products, input.productId, "LIMESTONE");
  if (product.prntPercent == null) throw new CommercialSimulationError("O calcário selecionado não possui PRNT cadastrado.", 422);
  try {
    const result = convertLimingRequirementToCommercialProduct({
      requirementTonPerHaPrnt100: requirement,
      productPrntPercent: product.prntPercent,
      areaHa,
      pricePerTon: product.pricePerTon,
    });
    const constraintViolations = limestoneConstraintViolations(product, result.productDoseKgPerHa);
    return {
      mode: input.mode,
      productId: product.id,
      requirementTonPerHaPrnt100: requirement,
      result: {
        ...result,
        constraintsSatisfied: constraintViolations.length === 0,
        constraintViolations,
      },
      sourceTargets: targets.sourceRows,
    } as const;
  } catch (error) {
    throw new CommercialSimulationError(error instanceof Error ? error.message : "Falha ao converter a necessidade de calcário.", 422);
  }
}
