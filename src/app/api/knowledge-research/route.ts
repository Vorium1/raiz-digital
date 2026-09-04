import { getPlatformSession } from "@/lib/auth/session";
import { listCropProfiles, listTechnicalRegions } from "@/lib/repositories/agronomic-profiles";
import { getLastKnowledgeResearchRun, knowledgeResearchCooldownRemainingDays, recordKnowledgeResearchRun } from "@/lib/repositories/ai-generations";
import { resolveKnowledgeResearchProvider } from "@/lib/ai/knowledge-research-provider";

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  const lastRun = await getLastKnowledgeResearchRun(session.tenantId, session.userId);
  const cooldownDaysRemaining = knowledgeResearchCooldownRemainingDays(lastRun?.createdAt ?? null);
  return Response.json({ lastRun, cooldownDaysRemaining });
}

export async function POST(request: Request) {
  const session = await getPlatformSession();
  if (!session) return Response.json({ error: "Sessão necessária." }, { status: 401 });
  if (!session.isPlatformCurator) return Response.json({ error: "Somente um curador da plataforma pode rodar a pesquisa periódica da base de conhecimento." }, { status: 403 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
  const force = body.force === true;

  const lastRun = await getLastKnowledgeResearchRun(session.tenantId, session.userId);
  const cooldownDaysRemaining = knowledgeResearchCooldownRemainingDays(lastRun?.createdAt ?? null);
  if (!force && cooldownDaysRemaining > 0) {
    return Response.json({ error: `A última pesquisa rodou recentemente. Faltam ${cooldownDaysRemaining} dia(s) para o próximo ciclo (ou force manualmente, se tiver certeza).` }, { status: 409 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "A IA de pesquisa ainda não está conectada neste servidor (falta configurar ANTHROPIC_API_KEY)." }, { status: 502 });
  }

  const [crops, regions] = await Promise.all([
    listCropProfiles(session.tenantId, session.userId),
    listTechnicalRegions(session.tenantId, session.userId),
  ]);
  const regionCodes = regions.map((region) => region.code as string);
  const provider = resolveKnowledgeResearchProvider();

  const perCrop: Array<{ cropId: string; cropCode: string; cropName: string; sources: Awaited<ReturnType<typeof provider.research>>["sources"]; error: string | null }> = [];
  let totalTokens = 0;
  let promptVersion = "unknown";

  for (const crop of crops) {
    try {
      const result = await provider.research({ cropCode: crop.code as string, cropName: crop.name as string, regionCodes });
      totalTokens += result.tokensUsed ?? 0;
      promptVersion = result.promptVersion;
      perCrop.push({ cropId: crop.id as string, cropCode: crop.code as string, cropName: crop.name as string, sources: result.sources, error: null });
    } catch (error) {
      perCrop.push({ cropId: crop.id as string, cropCode: crop.code as string, cropName: crop.name as string, sources: [], error: error instanceof Error ? error.message : "Falha desconhecida." });
    }
  }

  const generation = await recordKnowledgeResearchRun({
    tenantId: session.tenantId,
    userId: session.userId,
    provider: provider.name,
    model: provider.model,
    promptVersion,
    requestPayload: { regionCodes, cropCount: crops.length },
    perCrop,
    tokensUsed: totalTokens || null,
  });

  return Response.json({ generation }, { status: 201 });
}
