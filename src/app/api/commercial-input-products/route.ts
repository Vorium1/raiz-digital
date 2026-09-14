import { getPlatformSession } from "@/lib/auth/session";
import {
  CommercialInputProductError,
  createCommercialInputProduct,
  listCommercialInputProducts,
} from "@/lib/repositories/commercial-input-products";
import type { CommercialInputCatalogDraft, CommercialInputKind } from "@/domain/commercial-input-catalog";
import type { NutrientGuarantees } from "@/domain/commercial-input-engine";

const MANAGE_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST"]);

function parseDraft(body: Record<string, unknown>): CommercialInputCatalogDraft {
  return {
    code: typeof body.code === "string" ? body.code : "",
    name: typeof body.name === "string" ? body.name : "",
    kind: body.kind as CommercialInputKind,
    guaranteesPercent: body.guaranteesPercent && typeof body.guaranteesPercent === "object"
      ? body.guaranteesPercent as NutrientGuarantees
      : {},
    prntPercent: body.prntPercent == null ? null : body.prntPercent as number,
    pricePerTon: body.pricePerTon == null ? null : body.pricePerTon as number,
    minRateKgPerHa: body.minRateKgPerHa == null ? null : body.minRateKgPerHa as number,
    maxRateKgPerHa: body.maxRateKgPerHa == null ? null : body.maxRateKgPerHa as number,
    active: body.active == null ? true : Boolean(body.active),
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
