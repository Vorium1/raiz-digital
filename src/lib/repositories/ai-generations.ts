import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export class AiGenerationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AiGenerationError";
  }
}

/**
 * Cada geração de IA vira uma linha imutável em `ai_generations` — nunca
 * sobrescrita. Revisão (aprovar/pedir ajuste/rejeitar) só muda o status e
 * os campos de revisor na MESMA linha; uma nova geração feita depois de um
 * pedido de ajuste aponta para a anterior via `supersededBy`, preservando
 * a cadeia completa (a geração original nunca desaparece).
 */
export async function recordAgronomicNarrativeGeneration(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  interpretationId: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  requestPayload: unknown;
  responsePayload: unknown;
  tokensUsed?: number | null;
  costUsd?: number | null;
  supersedes?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO ai_generations
       (tenant_id, kind, interpretation_id, analysis_id, provider, model, prompt_version, request_payload, response_payload, tokens_used, cost_usd, created_by)
       VALUES ($1::uuid, 'AGRONOMIC_NARRATIVE', $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::uuid)
       RETURNING id::text, status, created_at::text AS "createdAt"`,
      [
        input.tenantId, input.interpretationId, input.analysisId, input.provider, input.model, input.promptVersion,
        JSON.stringify(input.requestPayload), JSON.stringify(input.responsePayload), input.tokensUsed ?? null, input.costUsd ?? null, input.userId,
      ],
    );
    const created = result.rows[0];
    if (input.supersedes) {
      await client.query(`UPDATE ai_generations SET superseded_by = $3::uuid WHERE tenant_id = $1::uuid AND id = $2::uuid`, [input.tenantId, input.supersedes, created.id]);
    }
    await writeAudit(client, {
      tenantId: input.tenantId, userId: input.userId, action: "AI_AGRONOMIC_NARRATIVE_GENERATED", entityType: "ai_generation", entityId: created.id,
      metadata: { analysisId: input.analysisId, provider: input.provider, model: input.model, promptVersion: input.promptVersion, tokensUsed: input.tokensUsed ?? null },
    });
    return created;
  });
}

export async function getLatestAgronomicNarrative(tenantId: string, analysisId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT g.id::text, g.provider, g.model, g.prompt_version AS "promptVersion", g.response_payload AS "responsePayload",
              g.status, g.reviewer_note AS "reviewerNote", g.tokens_used AS "tokensUsed", g.cost_usd::float8 AS "costUsd",
              g.superseded_by::text AS "supersededBy", g.created_at::text AS "createdAt", g.reviewed_at::text AS "reviewedAt",
              reviewer.name AS "reviewedByName"
       FROM ai_generations g LEFT JOIN users reviewer ON reviewer.id = g.reviewed_by
       WHERE g.tenant_id = $1::uuid AND g.analysis_id = $2::uuid AND g.kind = 'AGRONOMIC_NARRATIVE'
       ORDER BY g.created_at DESC LIMIT 1`,
      [tenantId, analysisId],
    );
    return result.rows[0] ?? null;
  });
}

export async function listAgronomicNarrativeHistory(tenantId: string, analysisId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT g.id::text, g.status, g.provider, g.model, g.created_at::text AS "createdAt", g.reviewed_at::text AS "reviewedAt",
              g.reviewer_note AS "reviewerNote", reviewer.name AS "reviewedByName"
       FROM ai_generations g LEFT JOIN users reviewer ON reviewer.id = g.reviewed_by
       WHERE g.tenant_id = $1::uuid AND g.analysis_id = $2::uuid AND g.kind = 'AGRONOMIC_NARRATIVE'
       ORDER BY g.created_at DESC`,
      [tenantId, analysisId],
    );
    return result.rows;
  });
}

export async function reviewAgronomicNarrative(input: { tenantId: string; userId: string; generationId: string; decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; note?: string | null }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE ai_generations SET status = $3::ai_review_status, reviewer_note = nullif($4,''), reviewed_by = $5::uuid, reviewed_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       RETURNING id::text, status, analysis_id::text AS "analysisId"`,
      [input.tenantId, input.generationId, input.decision, input.note ?? "", input.userId],
    );
    const updated = result.rows[0];
    if (!updated) throw new AiGenerationError("Geração não encontrada.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "AI_AGRONOMIC_NARRATIVE_REVIEWED", entityType: "ai_generation", entityId: updated.id, metadata: { decision: input.decision } });
    return updated;
  });
}

export async function recordAgronomicPrescriptionGeneration(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  interpretationId: string | null;
  provider: string;
  model: string;
  promptVersion: string;
  requestPayload: unknown;
  responsePayload: unknown;
  tokensUsed?: number | null;
  costUsd?: number | null;
  supersedes?: string | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO ai_generations
       (tenant_id, kind, interpretation_id, analysis_id, provider, model, prompt_version, request_payload, response_payload, tokens_used, cost_usd, created_by)
       VALUES ($1::uuid, 'AGRONOMIC_PRESCRIPTION', $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::uuid)
       RETURNING id::text, status, created_at::text AS "createdAt"`,
      [
        input.tenantId, input.interpretationId, input.analysisId, input.provider, input.model, input.promptVersion,
        JSON.stringify(input.requestPayload), JSON.stringify(input.responsePayload), input.tokensUsed ?? null, input.costUsd ?? null, input.userId,
      ],
    );
    const created = result.rows[0];
    if (input.supersedes) {
      await client.query(`UPDATE ai_generations SET superseded_by = $3::uuid WHERE tenant_id = $1::uuid AND id = $2::uuid`, [input.tenantId, input.supersedes, created.id]);
    }
    await writeAudit(client, {
      tenantId: input.tenantId, userId: input.userId, action: "AI_AGRONOMIC_PRESCRIPTION_GENERATED", entityType: "ai_generation", entityId: created.id,
      metadata: { analysisId: input.analysisId, provider: input.provider, model: input.model, promptVersion: input.promptVersion, tokensUsed: input.tokensUsed ?? null },
    });
    return created;
  });
}

export async function getLatestAgronomicPrescription(tenantId: string, analysisId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT g.id::text, g.provider, g.model, g.prompt_version AS "promptVersion", g.response_payload AS "responsePayload",
              g.status, g.reviewer_note AS "reviewerNote", g.tokens_used AS "tokensUsed", g.cost_usd::float8 AS "costUsd",
              g.superseded_by::text AS "supersededBy", g.created_at::text AS "createdAt", g.reviewed_at::text AS "reviewedAt",
              reviewer.name AS "reviewedByName"
       FROM ai_generations g LEFT JOIN users reviewer ON reviewer.id = g.reviewed_by
       WHERE g.tenant_id = $1::uuid AND g.analysis_id = $2::uuid AND g.kind = 'AGRONOMIC_PRESCRIPTION'
       ORDER BY g.created_at DESC LIMIT 1`,
      [tenantId, analysisId],
    );
    return result.rows[0] ?? null;
  });
}

export async function listAgronomicPrescriptionHistory(tenantId: string, analysisId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT g.id::text, g.status, g.provider, g.model, g.created_at::text AS "createdAt", g.reviewed_at::text AS "reviewedAt",
              g.reviewer_note AS "reviewerNote", reviewer.name AS "reviewedByName"
       FROM ai_generations g LEFT JOIN users reviewer ON reviewer.id = g.reviewed_by
       WHERE g.tenant_id = $1::uuid AND g.analysis_id = $2::uuid AND g.kind = 'AGRONOMIC_PRESCRIPTION'
       ORDER BY g.created_at DESC`,
      [tenantId, analysisId],
    );
    return result.rows;
  });
}

/**
 * Aprovar uma prescrição é o único jeito de uma dose gerada por IA virar
 * `input_recommendations` (a tabela "oficial" usada na comparação
 * recomendado × usado). Enquanto PENDING_REVIEW/CHANGES_REQUESTED/REJECTED,
 * a prescrição existe só dentro de `ai_generations.response_payload` --
 * nunca alimenta a tabela oficial. Tudo dentro da mesma transação
 * (`withTenant` já abre BEGIN/COMMIT), então a promoção nunca fica pela
 * metade.
 */
export async function reviewAgronomicPrescription(input: { tenantId: string; userId: string; generationId: string; decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"; note?: string | null }) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `UPDATE ai_generations SET status = $3::ai_review_status, reviewer_note = nullif($4,''), reviewed_by = $5::uuid, reviewed_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid AND kind = 'AGRONOMIC_PRESCRIPTION'
       RETURNING id::text, status, analysis_id::text AS "analysisId", response_payload AS "responsePayload"`,
      [input.tenantId, input.generationId, input.decision, input.note ?? "", input.userId],
    );
    const updated = result.rows[0];
    if (!updated) throw new AiGenerationError("Prescrição não encontrada.", 404);
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "AI_AGRONOMIC_PRESCRIPTION_REVIEWED", entityType: "ai_generation", entityId: updated.id, metadata: { decision: input.decision } });

    let promotedCount = 0;
    if (input.decision === "APPROVED") {
      const payload = updated.responsePayload as { prescription?: { recommendations?: Array<{ inputType?: unknown; quantity?: unknown; unit?: unknown }> } } | null;
      const recommendations = payload?.prescription?.recommendations ?? [];
      for (const recommendation of recommendations) {
        if (typeof recommendation.inputType !== "string" || typeof recommendation.quantity !== "number" || typeof recommendation.unit !== "string") continue;
        await client.query(
          `INSERT INTO input_recommendations (tenant_id, analysis_id, input_type, quantity, unit, calculation_source)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
          [input.tenantId, updated.analysisId, recommendation.inputType, recommendation.quantity, recommendation.unit, `ai_generations:${updated.id}`],
        );
        promotedCount += 1;
      }
      if (promotedCount > 0) {
        await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "INPUT_RECOMMENDATIONS_PROMOTED_FROM_AI", entityType: "ai_generation", entityId: updated.id, metadata: { analysisId: updated.analysisId, count: promotedCount } });
      }
    }

    return { id: updated.id, status: updated.status, analysisId: updated.analysisId, promotedRecommendations: promotedCount };
  });
}

export async function recordOperationalAssistantGeneration(input: {
  tenantId: string; userId: string; provider: string; model: string; promptVersion: string;
  requestPayload: unknown; responsePayload: unknown; tokensUsed?: number | null; costUsd?: number | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query(
      `INSERT INTO ai_generations (tenant_id, kind, provider, model, prompt_version, request_payload, response_payload, tokens_used, cost_usd, status, created_by)
       VALUES ($1::uuid, 'OPERATIONAL_ASSISTANT', $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, 'APPROVED', $9::uuid)
       RETURNING id::text, created_at::text AS "createdAt"`,
      [input.tenantId, input.provider, input.model, input.promptVersion, JSON.stringify(input.requestPayload), JSON.stringify(input.responsePayload), input.tokensUsed ?? null, input.costUsd ?? null, input.userId],
    );
    const created = result.rows[0];
    await writeAudit(client, { tenantId: input.tenantId, userId: input.userId, action: "AI_ASSISTANT_QUERY", entityType: "ai_generation", entityId: created.id, metadata: { provider: input.provider, model: input.model } });
    return created;
  });
}

/**
 * Última pesquisa periódica da base de conhecimento -- usado tanto pra
 * mostrar "quando rodou pela última vez" na tela quanto pra impedir
 * (`runKnowledgeResearchNotAllowedYet`) rodar de novo cedo demais e estourar
 * o orçamento combinado com o diretor sem querer.
 */
export async function getLastKnowledgeResearchRun(tenantId: string, userId?: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT id::text, created_at::text AS "createdAt", tokens_used AS "tokensUsed", cost_usd::float8 AS "costUsd", response_payload AS "responsePayload"
       FROM ai_generations WHERE tenant_id = $1::uuid AND kind = 'KNOWLEDGE_RESEARCH' ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
    );
    return result.rows[0] ?? null;
  });
}

const KNOWLEDGE_RESEARCH_COOLDOWN_DAYS = 25;

export function knowledgeResearchCooldownRemainingDays(lastRunCreatedAt: string | null): number {
  if (!lastRunCreatedAt) return 0;
  const daysSince = (Date.now() - new Date(lastRunCreatedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(KNOWLEDGE_RESEARCH_COOLDOWN_DAYS - daysSince));
}

/**
 * Persiste o resultado de uma pesquisa periódica já executada (o
 * chamador -- a rota -- já correu a IA por cultura; aqui só grava). Cada
 * fonte encontrada vira uma linha DRAFT em `technical_sources`, sujeita à
 * mesma homologação humana de sempre; a linha em `ai_generations` é só o
 * registro/auditoria do ciclo (custo, quantas fontes, quais culturas
 * falharam), nasce já APPROVED porque não é ela quem carrega a afirmação
 * técnica -- as fontes DRAFT que ela gera é que precisam de homologação.
 */
export async function recordKnowledgeResearchRun(input: {
  tenantId: string;
  userId: string;
  providersUsed: string[];
  promptVersion: string;
  requestPayload: unknown;
  perCrop: Array<{
    cropId: string; cropCode: string; cropName: string;
    sources: Array<{ title: string; institution: string | null; editionYear: number | null; subject: string; content: string; regionCode: string | null }>;
    providerResults: Array<{ provider: string; model: string; sourcesCreated: number; error: string | null }>;
  }>;
  tokensUsed?: number | null;
  costUsd?: number | null;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const createdSourceIds: string[] = [];
    for (const crop of input.perCrop) {
      for (const source of crop.sources) {
        const inserted = await client.query(
          `INSERT INTO technical_sources (title, institution, edition_year, crop_profile_id, region_code, subject, content, authored_by)
           VALUES ($1, nullif($2,''), $3, $4::uuid, nullif($5,''), $6, $7, $8::uuid)
           RETURNING id::text`,
          [source.title, source.institution ?? "", source.editionYear, crop.cropId, source.regionCode ?? "", source.subject, source.content, input.userId],
        );
        createdSourceIds.push(inserted.rows[0].id);
      }
    }

    const summary = input.perCrop.map((crop) => ({ cropCode: crop.cropCode, cropName: crop.cropName, sourcesCreated: crop.sources.length, providerResults: crop.providerResults }));
    const created = await client.query(
      `INSERT INTO ai_generations (tenant_id, kind, provider, model, prompt_version, request_payload, response_payload, tokens_used, cost_usd, status, created_by)
       VALUES ($1::uuid, 'KNOWLEDGE_RESEARCH', $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, 'APPROVED', $9::uuid)
       RETURNING id::text, created_at::text AS "createdAt"`,
      [
        input.tenantId, input.providersUsed.join(",") || "none", "multiple", input.promptVersion, JSON.stringify(input.requestPayload),
        JSON.stringify({ perCrop: summary, totalSourcesCreated: createdSourceIds.length, providersUsed: input.providersUsed }),
        input.tokensUsed ?? null, input.costUsd ?? null, input.userId,
      ],
    );
    const generation = created.rows[0];
    await writeAudit(client, {
      tenantId: input.tenantId, userId: input.userId, action: "KNOWLEDGE_RESEARCH_RUN", entityType: "ai_generation", entityId: generation.id,
      metadata: { sourcesCreated: createdSourceIds.length, cropsResearched: input.perCrop.length, tokensUsed: input.tokensUsed ?? null },
    });
    return { ...generation, sourcesCreated: createdSourceIds.length, perCrop: summary };
  });
}
