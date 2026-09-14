import { getPlatformSession } from "@/lib/auth/session";
import {
  CommercialInputProductError,
  updateCommercialInputProduct,
  type CommercialInputProductPatch,
} from "@/lib/repositories/commercial-input-products";
import type { CommercialInputKind } from "@/domain/commercial-input-catalog";
import type { NutrientGuarantees } from "@/domain/commercial-input-engine";

const MANAGE_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

function parseNullableNumber(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CommercialInputProductError(`${key} precisa ser número ou nulo.`);
  }
  return value;
}

function parseGuarantees(value: unknown): NutrientGuarantees {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CommercialInputProductError("guaranteesPercent precisa ser um objeto de garantias.");
  }
  return value as NutrientGuarantees;
}

function parsePatch(body: Record<string, unknown>): CommercialInputProductPatch {
  const patch: CommercialInputProductPatch = {};
  if ("code" in body) patch.code = typeof body.code === "string" ? body.code : "";
  if ("name" in body) patch.name = typeof body.name === "string" ? body.name : "";
  if ("kind" in body) patch.kind = body.kind as CommercialInputKind;
  if ("guaranteesPercent" in body) patch.guaranteesPercent = parseGuarantees(body.guaranteesPercent);
  if ("prntPercent" in body) patch.prntPercent = parseNullableNumber(body, "prntPercent");
  if ("pricePerTon" in body) patch.pricePerTon = parseNullableNumber(body, "pricePerTon");
  if ("minRateKgPerHa" in body) patch.minRateKgPerHa = parseNullableNumber(body, "minRateKgPerHa");
  if ("maxRateKgPerHa" in body) patch.maxRateKgPerHa = parseNullableNumber(body, "maxRateKgPerHa");
  if ("active" in body) {
    if (typeof body.active !== "boolean") throw new CommercialInputProductError("active precisa ser booleano.");
    patch.active = body.active;
  }
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
