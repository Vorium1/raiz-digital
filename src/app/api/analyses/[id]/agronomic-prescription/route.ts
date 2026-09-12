import { getPlatformSession } from "@/lib/auth/session";
import { buildAgronomicPrescriptionEvidencePackage } from "@/lib/ai/prescription-evidence-package";
import { resolveAgronomicPrescriptionProvider } from "@/lib/ai/agronomic-prescription-provider";
import { getLatestInterpretation } from "@/lib/repositories/interpretations";
import { getLatestAgronomicPrescription, listAgronomicPrescriptionHistory, recordAgronomicPrescriptionGeneration } from "@/lib/repositories/ai-generations";
import { getTenantPrescriptionUsage } from "@/lib/repositories/tenant-plan";
import { checkPrescriptionGate } from "@/domain/agronomic-prescription-gate";

const runRoles = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const { id } = await context.params;
  const [latest, history, usage] = await Promise.all([
    getLatestAgronomicPrescription(session.tenantId, id, session.userId),
    listAgronomicPrescriptionHistory(session.tenantId, id, session.userId),
    getTenantPrescriptionUsage(session.tenantId),
  ]);
  return Response.json({ latest, history, usage });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!runRoles.has(session.role)) return Response.json({ error: "Seu perfil não pode gerar prescrição assistida por IA." }, { status: 403 });
  const { id } = await context.params;

  const usage = await getTenantPrescriptionUsage(session.tenantId);
  if (usage.usedThisMonth >= usage.monthlyLimit) {
    return Response.json({ error: `Limite mensal de prescrições por IA atingido (${usage.usedThisMonth}/${usage.monthlyLimit} este mês). Fale com o responsável pela plataforma para ajustar o plano.` }, { status: 429 });
  }

  const evidence = await buildAgronomicPrescriptionEvidencePackage(session.tenantId, session.userId, id);
  if (!evidence) return Response.json({ error: "Análise não encontrada." }, { status: 404 });
  if (evidence.results.length === 0) {
    return Response.json({ error: "Não há resultado de laboratório vinculado a esta análise ainda." }, { status: 409 });
  }

  // Fechamento técnico (auditoria Cabeda, 2026-09-11, item 8, revisado) -- achado real de governança: até
  // aqui, esta rota só conferia "existe algum lab_result" antes de pedir uma prescrição à IA, nunca se a
  // interpretação determinística tinha sido REVISADA E APROVADA por um profissional. `buildAgronomic
  // PrescriptionEvidencePackage` manda pra IA o `numeric_value` cru do laboratório, sem passar pela
  // classificação/homologação -- ou seja, era possível gerar uma "prescrição assistida" pra um laudo cuja
  // interpretação nunca rodou, ou rodou e não achou NENHUM parâmetro interpretável, ou tinha classificação
  // real mas AINDA NÃO passou pela revisão profissional (`IN_REVIEW` -- só o motor rodou, nenhum humano
  // confirmou ainda). A primeira versão deste gate aceitava `IN_REVIEW` também -- não é a governança
  // correta: `IN_REVIEW` é "calculado, aguardando revisão", não "aprovado". Fluxo correto:
  //
  //   interpretação determinística -> revisão profissional (reviewInterpretation) -> APPROVED
  //     -> prescrição/recomendação assistida (aqui, só a partir daqui)
  //     -> revisão/aprovação da prescrição (reviewAgronomicPrescription, já existente)
  //
  // Só `APPROVED` passa. `CALCULATED` (zero parâmetro interpretável) e `IN_REVIEW` (interpretável, mas
  // ainda sem revisão humana) recusam igualmente -- nenhum atalho por trás de "já tem classificação".
  const interpretation = await getLatestInterpretation(session.tenantId, id, session.userId);
  const gate = checkPrescriptionGate(interpretation?.status ?? null);
  if (!gate.allowed) {
    return Response.json({ error: gate.reason }, { status: 409 });
  }

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
