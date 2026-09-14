import { getPlatformSession } from "@/lib/auth/session";
import {
  CommercialInputProductError,
  updateCommercialInputProduct,
  type CommercialInputProductPatch,
} from "@/lib/repositories/commercial-input-products";
import type { CommercialInputKind } from "@/domain/commercial-input-catalog";
import type { NutrientGuarantees } from "@/domain/commercial-input-engine";

const MANAGE_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

function parsePatch(body: Record<string, unknown>): CommercialInputProductPatch {
  const patch: CommercialInputProductPatch = {};
  if ("code" in body) patch.code = typeof body.code === "string" ? body.code : "";
  if ("name" in body) patch.name = typeof body.name === "string" ? body.name : "";
  if ("kind" in body) patch.kind = body.kind as CommercialInputKind;
  if ("guaranteesPercent" in body) patch.guaranteesPercent = body.guaranteesPercent && typeof body.guaranteesPercent === "object"
    ? body.guaranteesPercent as NutrientGuarantees
    : {};
  if ("prntPercent" in body) patch.prntPercent = body.prntPercent == null ? null : body.prntPercent as number;
  if ("pricePerTon" in body) patch.pricePerTon = body.pricePerTon == null ? null : body.pricePerTon as number;
  if ("minRateKgPerHa" in body) patch.minRateKgPerHa = body.minRateKgPerHa == null ? null : body.minRateKgPerHa as number;
  if ("maxRateKgPerHa" in body) patch.maxRateKgPerHa = body.maxRateKgPerHa == null ? null : body.maxRateKgPerHa as number;
  if ("active" in body) patch.active = Boolean(body.active);
  return patch;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!MANAGE_ROLES.has(session.role)) return Response.json({ error: "Seu perfil não pode editar insumos comerciais." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const { id } = await context.params;

  try {
    const product = await updateCommercialInputProduct({
      tenantId: session.tenantId,
      userId: session.userId,
      productId: id,
      patch: parsePatch(body),
    });
    return Response.json({ product });
  } catch (error) {
    if (error instanceof CommercialInputProductError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
