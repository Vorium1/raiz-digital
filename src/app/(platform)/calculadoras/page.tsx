import { RaizCalculator } from "@/components/raiz-calculator";
import { requirePlatformSession } from "@/lib/auth/session";
import { listCommercialInputProducts } from "@/lib/repositories/commercial-input-products";
import type { CommercialNutrient } from "@/domain/commercial-input-engine";

export const metadata = { title: "Calculadoras" };

const NUTRIENTS = new Set<CommercialNutrient>(["N", "P2O5", "K2O", "S", "Ca", "Mg"]);
const MODES = new Set(["NUTRIENT_TO_PRODUCT","PRODUCT_TO_NUTRIENTS","PK_PAIR","LIME","CHEMICAL"] as const);

function numberParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export default async function CalculatorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePlatformSession();
  const [products, query] = await Promise.all([
    listCommercialInputProducts(session.tenantId, session.userId),
    searchParams,
  ]);
  const modeRaw = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  const mode = modeRaw && MODES.has(modeRaw as typeof MODES extends Set<infer T> ? T : never)
    ? modeRaw as "NUTRIENT_TO_PRODUCT"|"PRODUCT_TO_NUTRIENTS"|"PK_PAIR"|"LIME"|"CHEMICAL"
    : undefined;
  const nutrientRaw = Array.isArray(query.nutrient) ? query.nutrient[0] : query.nutrient;
  const nutrient = nutrientRaw && NUTRIENTS.has(nutrientRaw as CommercialNutrient)
    ? nutrientRaw as CommercialNutrient
    : undefined;

  return (
    <div className="simple-home">
      <header className="simple-home-head">
        <div>
          <span>FERRAMENTAS</span>
          <h1>Calculadoras</h1>
          <p>Converta necessidade agronômica em produto, confira nutrientes fornecidos e ajuste calcário por PRNT.</p>
        </div>
      </header>
      <RaizCalculator
        products={products}
        prefill={{
          mode,
          nutrient,
          targetKgPerHa: numberParam(query.target),
          areaHa: numberParam(query.area),
          limeRequirementTonHaPrnt100: numberParam(query.limeRequirement),
        }}
      />
    </div>
  );
}
