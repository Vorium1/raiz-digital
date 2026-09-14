import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { readRawStoredFile } from "@/lib/storage";

export class SourceVerificationError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
    this.name = "SourceVerificationError";
  }
}

function rawKeyBelongsToTenant(key: string, tenantId: string) {
  const normalized = key.startsWith("s3:v1:") ? key.slice("s3:v1:".length) : key;
  return normalized.startsWith(`imports/${tenantId}/sources/`) && !normalized.includes("../") && !normalized.includes("..\\");
}

async function computeAnalysisVerifiedState(client: PoolClient, tenantId: string, analysisId: string) {
  const result = await client.query<{
    importCount: number;
    archivedCount: number;
    verifiedCount: number;
  }>(
    `SELECT count(*)::int AS "importCount",
            count(*) FILTER (WHERE ai.raw_object_key IS NOT NULL)::int AS "archivedCount",
            count(*) FILTER (
              WHERE ai.raw_object_key IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM analysis_source_verifications v
                  WHERE v.tenant_id = ai.tenant_id
                    AND v.analysis_id = ai.analysis_id
                    AND v.import_id = ai.id
                    AND lower(v.file_sha256) = lower(ai.file_sha256)
                    AND v.raw_object_key = ai.raw_object_key
                )
            )::int AS "verifiedCount"
     FROM analysis_imports ai
     WHERE ai.tenant_id = $1::uuid AND ai.analysis_id = $2::uuid`,
    [tenantId, analysisId],
  );
  const counts = result.rows[0] ?? { importCount: 0, archivedCount: 0, verifiedCount: 0 };
  return {
    verified: counts.importCount > 0 && counts.archivedCount === counts.importCount && counts.verifiedCount === counts.importCount,
    ...counts,
  };
}

/** Recalcula o campo-resumo sem inferência: todo import vinculado precisa ter objeto bruto e confirmação exata. */
export async function refreshAnalysisSourceHumanVerified(
  client: PoolClient,
  input: { tenantId: string; analysisId: string },
) {
  const state = await computeAnalysisVerifiedState(client, input.tenantId, input.analysisId);
  await client.query(
    `UPDATE analyses
     SET source_human_verified = $3
     WHERE tenant_id = $1::uuid AND id = $2::uuid AND source_human_verified IS DISTINCT FROM $3`,
    [input.tenantId, input.analysisId, state.verified],
  );
  return state;
}

export async function getAnalysisSourceVerificationStatus(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
}) {
  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const analysisResult = await client.query<{
      sourceHumanVerified: boolean;
      verificationRequired: boolean;
    }>(
      `SELECT a.source_human_verified AS "sourceHumanVerified",
              t.require_source_human_verification AS "verificationRequired"
       FROM analyses a
       JOIN tenants t ON t.id = a.tenant_id
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid
       LIMIT 1`,
      [input.tenantId, input.analysisId],
    );
    const analysis = analysisResult.rows[0];
    if (!analysis) throw new SourceVerificationError("Análise não encontrada.", 404);

    const importsResult = await client.query<{
      id: string;
      fileName: string;
      fileSha256: string;
      sourceFormat: string;
      rawObjectKey: string | null;
      verifiedAt: string | null;
      verifiedByName: string | null;
    }>(
      `SELECT ai.id::text,
              ai.file_name AS "fileName",
              ai.file_sha256 AS "fileSha256",
              ai.source_format AS "sourceFormat",
              ai.raw_object_key AS "rawObjectKey",
              verified.verified_at::text AS "verifiedAt",
              verifier.name AS "verifiedByName"
       FROM analysis_imports ai
       LEFT JOIN LATERAL (
         SELECT v.verified_at, v.verified_by
         FROM analysis_source_verifications v
         WHERE v.tenant_id = ai.tenant_id
           AND v.analysis_id = ai.analysis_id
           AND v.import_id = ai.id
           AND lower(v.file_sha256) = lower(ai.file_sha256)
           AND v.raw_object_key = ai.raw_object_key
         ORDER BY v.verified_at DESC
         LIMIT 1
       ) verified ON true
       LEFT JOIN users verifier ON verifier.id = verified.verified_by
       WHERE ai.tenant_id = $1::uuid AND ai.analysis_id = $2::uuid
       ORDER BY ai.created_at DESC, ai.id DESC`,
      [input.tenantId, input.analysisId],
    );

    return {
      verificationRequired: analysis.verificationRequired,
      sourceHumanVerified: analysis.sourceHumanVerified,
      imports: importsResult.rows.map((row) => ({
        id: row.id,
        fileName: row.fileName,
        fileSha256: row.fileSha256,
        sourceFormat: row.sourceFormat,
        archived: Boolean(row.rawObjectKey),
        verified: Boolean(row.verifiedAt),
        verifiedAt: row.verifiedAt,
        verifiedByName: row.verifiedByName,
      })),
    };
  });
}

export async function confirmAnalysisImportSource(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  importId: string;
}) {
  const snapshot = await withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const result = await client.query<{
      id: string;
      fileName: string;
      fileSha256: string;
      rawObjectKey: string | null;
    }>(
      `SELECT id::text, file_name AS "fileName", file_sha256 AS "fileSha256", raw_object_key AS "rawObjectKey"
       FROM analysis_imports
       WHERE tenant_id = $1::uuid AND analysis_id = $2::uuid AND id = $3::uuid
       LIMIT 1`,
      [input.tenantId, input.analysisId, input.importId],
    );
    return result.rows[0] ?? null;
  });
  if (!snapshot) throw new SourceVerificationError("Importação não encontrada para esta análise.", 404);
  if (!snapshot.rawObjectKey) {
    throw new SourceVerificationError("O arquivo bruto desta importação não possui chave de armazenamento comprovada. Reimporte/recupere a proveniência antes de confirmar a fonte.", 409);
  }
  if (!rawKeyBelongsToTenant(snapshot.rawObjectKey, input.tenantId)) {
    throw new SourceVerificationError("A chave do arquivo bruto não pertence à empresa ativa.", 409);
  }

  let buffer: Buffer;
  try {
    buffer = await readRawStoredFile(snapshot.rawObjectKey);
  } catch (error) {
    throw new SourceVerificationError(error instanceof Error ? `Não foi possível reler o arquivo bruto: ${error.message}` : "Não foi possível reler o arquivo bruto.", 503);
  }
  const actualSha256 = createHash("sha256").update(buffer).digest("hex");
  if (actualSha256.toLowerCase() !== snapshot.fileSha256.toLowerCase()) {
    throw new SourceVerificationError("Integridade do arquivo bruto não confere com o SHA-256 registrado na importação. A confirmação foi bloqueada.", 409);
  }

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const locked = await client.query<{
      fileSha256: string;
      rawObjectKey: string | null;
    }>(
      `SELECT file_sha256 AS "fileSha256", raw_object_key AS "rawObjectKey"
       FROM analysis_imports
       WHERE tenant_id = $1::uuid AND analysis_id = $2::uuid AND id = $3::uuid
       FOR UPDATE`,
      [input.tenantId, input.analysisId, input.importId],
    );
    const current = locked.rows[0];
    if (!current) throw new SourceVerificationError("Importação não encontrada para esta análise.", 404);
    if (current.fileSha256.toLowerCase() !== snapshot.fileSha256.toLowerCase() || current.rawObjectKey !== snapshot.rawObjectKey) {
      throw new SourceVerificationError("A proveniência da importação mudou durante a conferência. Reabra o laudo e confirme novamente.", 409);
    }

    const inserted = await client.query<{ id: string; verifiedAt: string }>(
      `INSERT INTO analysis_source_verifications
       (tenant_id, analysis_id, import_id, file_sha256, raw_object_key, verified_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid)
       ON CONFLICT (tenant_id, import_id, file_sha256, raw_object_key) DO NOTHING
       RETURNING id::text, verified_at::text AS "verifiedAt"`,
      [input.tenantId, input.analysisId, input.importId, snapshot.fileSha256, snapshot.rawObjectKey, input.userId],
    );

    const state = await refreshAnalysisSourceHumanVerified(client, {
      tenantId: input.tenantId,
      analysisId: input.analysisId,
    });

    if ((inserted.rowCount ?? 0) > 0) {
      await writeAudit(client, {
        tenantId: input.tenantId,
        userId: input.userId,
        action: "ANALYSIS_SOURCE_HUMAN_VERIFIED",
        entityType: "analysis_import",
        entityId: input.importId,
        metadata: {
          analysisId: input.analysisId,
          fileName: snapshot.fileName,
          sha256: snapshot.fileSha256,
          rawObjectKey: snapshot.rawObjectKey,
          analysisFullyVerified: state.verified,
        },
      });
    }

    return {
      importId: input.importId,
      idempotent: (inserted.rowCount ?? 0) === 0,
      analysisFullyVerified: state.verified,
      importCount: state.importCount,
      verifiedCount: state.verifiedCount,
    };
  });
}
