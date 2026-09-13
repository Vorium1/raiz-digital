import { withTenant } from "@/lib/db";

export async function getAgronomicPrescriptionReviewState(
  tenantId: string,
  generationId: string,
  userId?: string,
): Promise<{ id: string; analysisId: string; status: "PENDING_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" } | null> {
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query(
      `SELECT id::text, analysis_id::text AS "analysisId", status::text
       FROM ai_generations
       WHERE tenant_id = $1::uuid AND id = $2::uuid AND kind = 'AGRONOMIC_PRESCRIPTION'
       LIMIT 1`,
      [tenantId, generationId],
    );
    return result.rows[0] ?? null;
  });
}
