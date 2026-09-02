import { createHash } from "node:crypto";
import { buildLabImportPreview, buildLabImportPreviewFromXlsxBase64, isSpreadsheetFileName } from "@/domain/lab-import";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";

export async function commitCsvImport(input: {
  tenantId: string;
  userId: string;
  analysisId: string;
  content: string;
  fileName: string;
  fallbackMethod?: string;
  hasAgronomicContext?: boolean;
  spatialLinked?: boolean;
}) {
  const isSpreadsheet = isSpreadsheetFileName(input.fileName);
  const importContext = {
    fallbackMethod: input.fallbackMethod,
    hasAgronomicContext: input.hasAgronomicContext,
    spatialLinked: input.spatialLinked,
  };
  const preview = isSpreadsheet
    ? buildLabImportPreviewFromXlsxBase64(input.content, input.fileName, importContext)
    : buildLabImportPreview(input.content, input.fileName, importContext);

  const sha256 = createHash("sha256").update(input.content).digest("hex");
  const persistedStatus = preview.blockers > 0 ? "INCONSISTENT" : "VALIDATED";

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    const importResult = await client.query<{ id: string }>(
      `INSERT INTO analysis_imports
       (tenant_id, analysis_id, file_name, file_sha256, source_format, status, detected_headers,
        normalized_row_count, blocker_count, warning_count, confidence_score, validation_issues, created_by)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::import_status, $7::jsonb, $8, $9, $10, $11, $12::jsonb, $13::uuid)
       ON CONFLICT (tenant_id, file_sha256, analysis_id)
       DO UPDATE SET blocker_count = EXCLUDED.blocker_count,
                     warning_count = EXCLUDED.warning_count,
                     confidence_score = EXCLUDED.confidence_score,
                     validation_issues = EXCLUDED.validation_issues
       RETURNING id::text`,
      [
        input.tenantId,
        input.analysisId,
        input.fileName,
        sha256,
        isSpreadsheet ? "XLSX" : preview.format === "LONG" ? "CSV_LONG" : "CSV_WIDE",
        persistedStatus,
        JSON.stringify(preview.detectedHeaders),
        preview.rows.length,
        preview.blockers,
        preview.warnings,
        preview.confidence.score,
        JSON.stringify(preview.issues),
        input.userId,
      ],
    );

    const importId = importResult.rows[0].id;
    await client.query("DELETE FROM analysis_import_rows WHERE tenant_id = $1::uuid AND import_id = $2::uuid", [input.tenantId, importId]);

    for (const row of preview.rows) {
      await client.query(
        `INSERT INTO analysis_import_rows
         (tenant_id, import_id, source_line, sample_code, parameter_code, numeric_value, unit, analytical_method,
          unit_inferred, method_inferred, raw_payload)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
        [
          input.tenantId,
          importId,
          row.sourceLine,
          row.sampleCode,
          row.parameterCode,
          row.value,
          row.unit,
          row.method,
          row.unitInferred,
          row.methodInferred,
          JSON.stringify({ sourceLine: row.sourceLine, source: row.source }),
        ],
      );
    }

    await client.query(
      `UPDATE analyses
       SET status = $3::analysis_status,
           source_type = 'CSV',
           confidence_score = $4,
           confidence_level = $5,
           updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [input.tenantId, input.analysisId, preview.blockers > 0 ? "INCONSISTENT" : "IMPORTED", preview.confidence.score, preview.confidence.level],
    );

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "LAB_IMPORT_COMMITTED",
      entityType: "analysis",
      entityId: input.analysisId,
      metadata: { importId, sha256, blockers: preview.blockers, warnings: preview.warnings },
    });

    return { importId, preview, analysisStatus: preview.blockers > 0 ? "INCONSISTENT" : "IMPORTED" };
  });
}
