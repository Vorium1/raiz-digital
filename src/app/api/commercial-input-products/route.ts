import { getPlatformSession } from "@/lib/auth/session";
import {
  CommercialInputProductError,
  createCommercialInputProduct,
  listCommercialInputProducts,
} from "@/lib/repositories/commercial-input-products";
import type { CommercialInputCatalogDraft, CommercialInputKind } from "@/domain/commercial-input-catalog";
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

function parseDraft(body: Record<string, unknown>): CommercialInputCatalogDraft {
  if (body.active != null && typeof body.active !== "boolean") {
    throw new CommercialInputProductError("active precisa ser booleano.");
  }
  return {
    code: typeof body.code === "string" ? body.code : "",
    name: typeof body.name === "string" ? body.name : "",
    kind: body.kind as CommercialInputKind,
    guaranteesPercent: parseGuarantees(body.guaranteesPercent),
    prntPercent: parseNullableNumber(body, "prntPercent"),
    pricePerTon: parseNullableNumber(body, "pricePerTon"),
    minRateKgPerHa: parseNullableNumber(body, "minRateKgPerHa"),
    maxRateKgPerHa: parseNullableNumber(body, "maxRateKgPerHa"),
    active: body.active == null ? true : body.active,
  };
}

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const products = await listCommercialInputProducts(session.tenantId, session.userId);
  return Response.json({ products, canManage: MANAGE_ROLES.has(session.role) });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!MANAGE_ROLES.has(session.role)) return Response.json({ error: "Seu perfil não pode cadastrar insumos comerciais." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  try {
    const product = await createCommercialInputProduct({
      tenantId: session.tenantId,
      userId: session.userId,
      product: parseDraft(body),
    });
    return Response.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof CommercialInputProductError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
