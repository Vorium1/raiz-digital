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
