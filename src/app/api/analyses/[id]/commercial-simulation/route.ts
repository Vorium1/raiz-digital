import { getPlatformSession } from "@/lib/auth/session";
import type { CommercialNutrient } from "@/domain/commercial-input-engine";
import {
  CommercialSimulationError,
  getCommercialSimulationWorkspace,
  simulateCommercialPlan,
  type CommercialSimulationMode,
} from "@/lib/repositories/commercial-simulation";

const MODES = new Set<CommercialSimulationMode>(["SINGLE", "PK_PAIR", "LIME"]);
const NUTRIENTS = new Set<CommercialNutrient>(["N", "P2O5", "K2O", "S", "Ca", "Mg"]);

function parseOptionalString(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) throw new CommercialSimulationError("Identificador de produto inválido.", 400);
  return value.trim();
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  try {
    const workspace = await getCommercialSimulationWorkspace({ tenantId: session.tenantId, userId: session.userId, analysisId: id });
    return Response.json({ workspace });
  } catch (error) {
    if (error instanceof CommercialSimulationError) return Response.json({ error: error.message, details: error.details ?? null }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const mode = body.mode as CommercialSimulationMode;
  if (!MODES.has(mode)) return Response.json({ error: "Modo de simulação inválido." }, { status: 400 });

  let driverNutrient: CommercialNutrient | null = null;
  if (body.driverNutrient != null) {
    if (typeof body.driverNutrient !== "string" || !NUTRIENTS.has(body.driverNutrient as CommercialNutrient)) {
      return Response.json({ error: "Nutriente-guia inválido." }, { status: 400 });
    }
    driverNutrient = body.driverNutrient as CommercialNutrient;
  }

  try {
    const { id } = await context.params;
    const simulation = await simulateCommercialPlan({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
      mode,
      productId: parseOptionalString(body.productId),
      productAId: parseOptionalString(body.productAId),
      productBId: parseOptionalString(body.productBId),
      driverNutrient,
    });
    return Response.json({ simulation });
  } catch (error) {
    if (error instanceof CommercialSimulationError) return Response.json({ error: error.message, details: error.details ?? null }, { status: error.status });
    throw error;
  }
}
