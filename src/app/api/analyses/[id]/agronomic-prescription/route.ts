import { getPlatformSession } from "@/lib/auth/session";
import { buildAgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";
import { resolveAgronomicPrescriptionProvider } from "@/lib/ai/agronomic-prescription-provider";
import { getLatestInterpretation } from "@/lib/repositories/interpretations";
import { getLatestAgronomicPrescription, listAgronomicPrescriptionHistory, recordAgronomicPrescriptionGeneration } from "@/lib/repositories/ai-generations";

const runRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  const [latest, history] = await Promise.all([
    getLatestAgronomicPrescription(session.tenantId, id, session.userId),
    listAgronomicPrescriptionHistory(session.tenantId, id, session.userId),
  ]);
  return Response.json({ latest, history });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!runRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode gerar prescrição assistida por IA." }, { status: 403 });
  const { id } = await context.params;

  const evidence = await buildAgronomicPrescriptionEvidencePackage(session.tenantId, session.userId, id);
  if (!evidence) return Response.json({ error: "Análise não encontrada." }, { status: 404 });
  if (evidence.results.length === 0) {
    return Response.json({ error: "Não há resultado de laboratório vinculado a esta análise ainda." }, { status: 409 });
  }

  const interpretation = await getLatestInterpretation(session.tenantId, id, session.userId);
  const provider = resolveAgronomicPrescriptionProvider();

  let result;
  try {
    result = await provider.prescribe({ evidence });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao gerar prescrição." }, { status: 502 });
  }

  const previous = await getLatestAgronomicPrescription(session.tenantId, id, session.userId);
  const created = await recordAgronomicPrescriptionGeneration({
    tenantId: session.tenantId,
    userId: session.userId,
    analysisId: id,
    interpretationId: interpretation?.id ?? null,
    provider: result.provider,
    model: result.model,
    promptVersion: result.promptVersion,
    requestPayload: { evidence },
    responsePayload: { prescription: result.prescription, isRealLanguageModel: result.isRealLanguageModel },
    tokensUsed: result.tokensUsed ?? null,
    costUsd: result.costUsd ?? null,
    supersedes: previous?.status === "CHANGES_REQUESTED" ? previous.id : null,
  });

  return Response.json({ generation: created, prescription: result.prescription, isRealLanguageModel: result.isRealLanguageModel }, { status: 201 });
}
