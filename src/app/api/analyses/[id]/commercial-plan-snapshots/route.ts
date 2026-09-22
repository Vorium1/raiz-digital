import type { CommercialNutrient } from "@/domain/commercial-input-engine";
import { getPlatformSession } from "@/lib/auth/session";
import {
  CommercialPlanSnapshotError,
  listCommercialPlanSnapshots,
  saveCommercialPlanSnapshot,
} from "@/lib/repositories/commercial-plan-snapshots";
import type { CommercialSimulationMode } from "@/lib/repositories/commercial-simulation";

const SAVE_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH", "COMMERCIAL"]);
const MODES = new Set<CommercialSimulationMode>(["SINGLE", "PK_PAIR", "LIME"]);
const NUTRIENTS = new Set<CommercialNutrient>(["N", "P2O5", "K2O", "S", "Ca", "Mg"]);

function parseOptionalString(value: unknown, label: string) {
  if (value == null) return null;
  if (typeof value !== "string") throw new CommercialPlanSnapshotError(`${label} inválido.`, 400);
  const normalized = value.trim();
  return normalized || null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  try {
    const snapshots = await listCommercialPlanSnapshots({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
    });
    return Response.json({ snapshots, canSave: SAVE_ROLES.has(session.role) });
  } catch (error) {
    if (error instanceof CommercialPlanSnapshotError) return Response.json({ error: error.message, details: error.details ?? null }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!SAVE_ROLES.has(session.role)) return Response.json({ error: "Seu perfil pode consultar, mas não salvar cenários comerciais." }, { status: 403 });

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
    const snapshot = await saveCommercialPlanSnapshot({
      tenantId: session.tenantId,
      userId: session.userId,
      analysisId: id,
      label: parseOptionalString(body.label, "Nome do cenário"),
      mode,
      productId: parseOptionalString(body.productId, "Produto"),
      productAId: parseOptionalString(body.productAId, "Produto A"),
      productBId: parseOptionalString(body.productBId, "Produto B"),
      driverNutrient,
    });
    return Response.json({ snapshot }, { status: 201 });
  } catch (error) {
    if (error instanceof CommercialPlanSnapshotError) return Response.json({ error: error.message, details: error.details ?? null }, { status: error.status });
    throw error;
  }
}
