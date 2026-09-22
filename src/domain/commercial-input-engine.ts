/**
 * Camada COMERCIAL do motor agronômico.
 *
 * Este módulo NÃO decide necessidade agronômica, NÃO escolhe marca e NÃO inventa preço/fórmula.
 * Ele recebe alvos já calculados/homologados e produtos explicitamente informados pelo usuário/catálogo,
 * convertendo nutrientes em kg/ha de produto, custo e total do talhão.
 *
 * A separação é intencional:
 *   análise -> necessidade agronômica -> produto comercial -> custo/logística.
 * Um rótulo de "tecnologia" ou "investimento" nunca multiplica dose aqui.
 */

export type CommercialNutrient = "N" | "P2O5" | "K2O" | "S" | "Ca" | "Mg";
export type NutrientGuarantees = Partial<Record<CommercialNutrient, number>>;
export type NutrientTargets = Partial<Record<CommercialNutrient, number>>;

export type CommercialFertilizerProduct = {
  code: string;
  name: string;
  /** Garantias em % m/m, exatamente como cadastradas para o produto. */
  guaranteesPercent: NutrientGuarantees;
  /** R$/t; opcional para permitir cálculo físico sem inventar preço. */
  pricePerTon?: number | null;
  /** Limites operacionais informados pelo usuário/catálogo, não limites agronômicos. */
  minRateKgPerHa?: number | null;
  maxRateKgPerHa?: number | null;
};

export type NutrientSupply = Partial<Record<CommercialNutrient, number>>;

export type TargetComparison = Partial<Record<CommercialNutrient, {
  targetKgPerHa: number;
  suppliedKgPerHa: number;
  differenceKgPerHa: number;
}>>;

export type ProductRateEvaluation = {
  product: CommercialFertilizerProduct;
  rateKgPerHa: number;
  suppliedKgPerHa: NutrientSupply;
  targetComparison: TargetComparison;
  costPerHa: number | null;
  totalProductKg: number | null;
  totalProductTon: number | null;
  totalCost: number | null;
  constraintsSatisfied: boolean;
  constraintViolations: string[];
};

export type TwoProductPkSolution = {
  productA: ProductRateEvaluation;
  productB: ProductRateEvaluation;
  combinedSuppliedKgPerHa: NutrientSupply;
  targetComparison: TargetComparison;
  costPerHa: number | null;
  totalCost: number | null;
};

const NUTRIENTS: CommercialNutrient[] = ["N", "P2O5", "K2O", "S", "Ca", "Mg"];
const EPSILON = 1e-9;

function finiteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} deve ser um número finito maior ou igual a zero.`);
}

function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function validateProduct(product: CommercialFertilizerProduct) {
  if (!product.code.trim()) throw new Error("Código do produto comercial é obrigatório.");
  if (!product.name.trim()) throw new Error("Nome do produto comercial é obrigatório.");

  for (const nutrient of NUTRIENTS) {
    const guarantee = product.guaranteesPercent[nutrient];
    if (guarantee == null) continue;
    finiteNonNegative(guarantee, `Garantia de ${nutrient}`);
    if (guarantee > 100) throw new Error(`Garantia de ${nutrient} não pode exceder 100%.`);
  }

  if (product.pricePerTon != null) finiteNonNegative(product.pricePerTon, "Preço por tonelada");
  if (product.minRateKgPerHa != null) finiteNonNegative(product.minRateKgPerHa, "Dose operacional mínima");
  if (product.maxRateKgPerHa != null) finiteNonNegative(product.maxRateKgPerHa, "Dose operacional máxima");
  if (
    product.minRateKgPerHa != null
    && product.maxRateKgPerHa != null
    && product.minRateKgPerHa > product.maxRateKgPerHa
  ) throw new Error("Dose operacional mínima não pode ser maior que a máxima.");
}

function validateTargets(targets: NutrientTargets) {
  for (const nutrient of NUTRIENTS) {
    const target = targets[nutrient];
    if (target == null) continue;
    finiteNonNegative(target, `Alvo de ${nutrient}`);
  }
}

function validateArea(areaHa?: number | null) {
  if (areaHa == null) return;
  if (!Number.isFinite(areaHa) || areaHa <= 0) throw new Error("Área deve ser um número finito maior que zero.");
}

function nutrientFraction(product: CommercialFertilizerProduct, nutrient: CommercialNutrient) {
  return (product.guaranteesPercent[nutrient] ?? 0) / 100;
}

function computeSupply(product: CommercialFertilizerProduct, rateKgPerHa: number): NutrientSupply {
  const supplied: NutrientSupply = {};
  for (const nutrient of NUTRIENTS) {
    const guarantee = product.guaranteesPercent[nutrient];
    if (guarantee == null || guarantee === 0) continue;
    supplied[nutrient] = round(rateKgPerHa * (guarantee / 100));
  }
  return supplied;
}

function compareTargets(targets: NutrientTargets, supplied: NutrientSupply): TargetComparison {
  const comparison: TargetComparison = {};
  for (const nutrient of NUTRIENTS) {
    const target = targets[nutrient];
    // Nutriente sem alvo é deliberadamente INFORMATIVO: não recebe rótulo de excesso/deficiência.
    if (target == null) continue;
    const delivered = supplied[nutrient] ?? 0;
    comparison[nutrient] = {
      targetKgPerHa: round(target),
      suppliedKgPerHa: round(delivered),
      differenceKgPerHa: round(delivered - target),
    };
  }
  return comparison;
}

export function evaluateCommercialProductRate(input: {
  product: CommercialFertilizerProduct;
  rateKgPerHa: number;
  targetsKgPerHa?: NutrientTargets;
  areaHa?: number | null;
}): ProductRateEvaluation {
  validateProduct(input.product);
  finiteNonNegative(input.rateKgPerHa, "Dose do produto");
  validateArea(input.areaHa);
  const targets = input.targetsKgPerHa ?? {};
  validateTargets(targets);

  const supplied = computeSupply(input.product, input.rateKgPerHa);
  const constraintViolations: string[] = [];
  if (input.product.minRateKgPerHa != null && input.rateKgPerHa + EPSILON < input.product.minRateKgPerHa) {
    constraintViolations.push(`Dose ${round(input.rateKgPerHa)} kg/ha abaixo do mínimo operacional de ${input.product.minRateKgPerHa} kg/ha.`);
  }
  if (input.product.maxRateKgPerHa != null && input.rateKgPerHa - EPSILON > input.product.maxRateKgPerHa) {
    constraintViolations.push(`Dose ${round(input.rateKgPerHa)} kg/ha acima do máximo operacional de ${input.product.maxRateKgPerHa} kg/ha.`);
  }

  const price = input.product.pricePerTon ?? null;
  const costPerHa = price == null ? null : round((input.rateKgPerHa / 1000) * price, 2);
  const totalProductKg = input.areaHa == null ? null : round(input.rateKgPerHa * input.areaHa, 3);
  const totalProductTon = totalProductKg == null ? null : round(totalProductKg / 1000, 4);
  const totalCost = costPerHa == null || input.areaHa == null ? null : round(costPerHa * input.areaHa, 2);

  return {
    product: input.product,
    rateKgPerHa: round(input.rateKgPerHa),
    suppliedKgPerHa: supplied,
    targetComparison: compareTargets(targets, supplied),
    costPerHa,
    totalProductKg,
    totalProductTon,
    totalCost,
    constraintsSatisfied: constraintViolations.length === 0,
    constraintViolations,
  };
}

/**
 * Converte um alvo de UM nutriente em kg/ha do produto escolhido.
 * Ex.: alvo P2O5 / fração P2O5 do produto. A função não interpreta a conveniência agronômica do produto.
 */
export function computeSingleProductRateFromNutrient(input: {
  product: CommercialFertilizerProduct;
  driverNutrient: CommercialNutrient;
  targetKgPerHa: number;
  allTargetsKgPerHa?: NutrientTargets;
  areaHa?: number | null;
}): ProductRateEvaluation {
  validateProduct(input.product);
  finiteNonNegative(input.targetKgPerHa, `Alvo de ${input.driverNutrient}`);
  const fraction = nutrientFraction(input.product, input.driverNutrient);
  if (fraction <= 0) {
    throw new Error(`${input.product.name} não possui garantia positiva de ${input.driverNutrient}; não é possível usá-lo como nutriente-guia.`);
  }
  const rate = input.targetKgPerHa / fraction;
  return evaluateCommercialProductRate({
    product: input.product,
    rateKgPerHa: rate,
    targetsKgPerHa: { ...(input.allTargetsKgPerHa ?? {}), [input.driverNutrient]: input.targetKgPerHa },
    areaHa: input.areaHa,
  });
}

/**
 * Resolve exatamente P2O5 + K2O usando dois produtos informados, por sistema linear 2x2.
 * Não é um otimizador comercial: se a matriz for singular ou a solução exigir dose negativa, falha fechado.
 */
export function solveTwoProductPkPlan(input: {
  productA: CommercialFertilizerProduct;
  productB: CommercialFertilizerProduct;
  targetP2O5KgPerHa: number;
  targetK2OKgPerHa: number;
  additionalTargetsKgPerHa?: NutrientTargets;
  areaHa?: number | null;
}): TwoProductPkSolution {
  validateProduct(input.productA);
  validateProduct(input.productB);
  finiteNonNegative(input.targetP2O5KgPerHa, "Alvo de P2O5");
  finiteNonNegative(input.targetK2OKgPerHa, "Alvo de K2O");
  validateArea(input.areaHa);

  const pA = nutrientFraction(input.productA, "P2O5");
  const kA = nutrientFraction(input.productA, "K2O");
  const pB = nutrientFraction(input.productB, "P2O5");
  const kB = nutrientFraction(input.productB, "K2O");
  const determinant = pA * kB - pB * kA;
  if (Math.abs(determinant) < 1e-12) {
    throw new Error("Os dois produtos têm relações P2O5/K2O linearmente dependentes; não existe solução única para os dois alvos.");
  }

  let rateA = (input.targetP2O5KgPerHa * kB - pB * input.targetK2OKgPerHa) / determinant;
  let rateB = (pA * input.targetK2OKgPerHa - input.targetP2O5KgPerHa * kA) / determinant;
  if (rateA < -EPSILON || rateB < -EPSILON) {
    throw new Error("A combinação informada exigiria dose negativa de pelo menos um produto; os produtos não atendem simultaneamente os alvos P2O5/K2O.");
  }
  if (Math.abs(rateA) < EPSILON) rateA = 0;
  if (Math.abs(rateB) < EPSILON) rateB = 0;

  const targets: NutrientTargets = {
    ...(input.additionalTargetsKgPerHa ?? {}),
    P2O5: input.targetP2O5KgPerHa,
    K2O: input.targetK2OKgPerHa,
  };
  validateTargets(targets);

  const productA = evaluateCommercialProductRate({ product: input.productA, rateKgPerHa: rateA, targetsKgPerHa: targets, areaHa: input.areaHa });
  const productB = evaluateCommercialProductRate({ product: input.productB, rateKgPerHa: rateB, targetsKgPerHa: targets, areaHa: input.areaHa });

  const combined: NutrientSupply = {};
  for (const nutrient of NUTRIENTS) {
    const value = (productA.suppliedKgPerHa[nutrient] ?? 0) + (productB.suppliedKgPerHa[nutrient] ?? 0);
    if (value !== 0) combined[nutrient] = round(value);
  }

  const knownCosts = [productA.costPerHa, productB.costPerHa];
  const costPerHa = knownCosts.some((value) => value == null)
    ? null
    : round((knownCosts[0] as number) + (knownCosts[1] as number), 2);
  const totalCost = costPerHa == null || input.areaHa == null ? null : round(costPerHa * input.areaHa, 2);

  return {
    productA,
    productB,
    combinedSuppliedKgPerHa: combined,
    targetComparison: compareTargets(targets, combined),
    costPerHa,
    totalCost,
  };
}

export type LimingCommercialConversion = {
  requirementTonPerHaPrnt100: number;
  productPrntPercent: number;
  productDoseTonPerHa: number;
  productDoseKgPerHa: number;
  areaHa: number | null;
  totalProductTon: number | null;
  costPerHa: number | null;
  totalCost: number | null;
};

/**
 * Ajusta a necessidade expressa como calcário equivalente a PRNT 100% para o PRNT REAL do produto.
 * Fórmula: dose real (t/ha) = necessidade PRNT100 × 100 / PRNT(%).
 */
export function convertLimingRequirementToCommercialProduct(input: {
  requirementTonPerHaPrnt100: number;
  productPrntPercent: number;
  areaHa?: number | null;
  pricePerTon?: number | null;
}): LimingCommercialConversion {
  finiteNonNegative(input.requirementTonPerHaPrnt100, "Necessidade de calcário PRNT 100%");
  if (!Number.isFinite(input.productPrntPercent) || input.productPrntPercent <= 0) {
    throw new Error("PRNT do produto deve ser um número finito maior que zero.");
  }
  validateArea(input.areaHa);
  if (input.pricePerTon != null) finiteNonNegative(input.pricePerTon, "Preço do calcário por tonelada");

  // Não impomos teto artificial de 100% ao PRNT: o motor usa exatamente o valor cadastrado/validado.
  const productDoseTonPerHa = input.requirementTonPerHaPrnt100 * (100 / input.productPrntPercent);
  const area = input.areaHa ?? null;
  const totalProductTon = area == null ? null : round(productDoseTonPerHa * area, 4);
  const costPerHa = input.pricePerTon == null ? null : round(productDoseTonPerHa * input.pricePerTon, 2);
  const totalCost = costPerHa == null || area == null ? null : round(costPerHa * area, 2);

  return {
    requirementTonPerHaPrnt100: round(input.requirementTonPerHaPrnt100),
    productPrntPercent: round(input.productPrntPercent),
    productDoseTonPerHa: round(productDoseTonPerHa, 4),
    productDoseKgPerHa: round(productDoseTonPerHa * 1000, 2),
    areaHa: area,
    totalProductTon,
    costPerHa,
    totalCost,
  };
}
