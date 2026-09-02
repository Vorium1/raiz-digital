import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { buildLabImportPreview, buildLabImportPreviewFromXlsxBase64, isSpreadsheetFileName, type LabImportIssue, type LabImportRow } from "@/domain/lab-import";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { saveRawImportFile } from "@/lib/storage";

/**
 * Promove linhas validadas do laudo (staging em analysis_import_rows) para as
 * tabelas normalizadas lab_samples/lab_results, que é o que o motor
 * determinístico e o restante da plataforma realmente leem. Antes desta
 * função o import commit só gravava em analysis_import_rows e nunca chegava
 * a lab_results — a cadeia de rastreabilidade ficava quebrada exatamente
 * nesse ponto (laudo → amostra → parâmetro).
 *
 * Só promove linhas cuja própria linha não tenha um BLOCKER (unidade/método
 * desconhecidos, valor inválido etc.) — linhas bloqueadas continuam
 * disponíveis em analysis_import_rows para conferência humana, mas nunca
 * viram um lab_result "quase certo".
 */
async function promoteRowsToLabResults(
  client: PoolClient,
  input: { tenantId: string; analysisId: string; importId: string; rows: LabImportRow[]; issues: LabImportIssue[] },
) {
  const blockedLines = new Set(input.issues.filter((issue) => issue.severity === "BLOCKER" && issue.line != null).map((issue) => issue.line));
  const promotable = input.rows.filter((row) => !blockedLines.has(row.sourceLine));
  if (promotable.length === 0) return { promotedSamples: 0, promotedResults: 0 };

  const analysisResult = await client.query<{ collectionOrderId: string | null }>(
    `SELECT collection_order_id::text AS "collectionOrderId" FROM analyses WHERE tenant_id = $1::uuid AND id = $2::uuid`,
    [input.tenantId, input.analysisId],
  );
  const collectionOrderId = analysisResult.rows[0]?.collectionOrderId ?? null;

  const bySample = new Map<string, LabImportRow[]>();
  for (const row of promotable) {
    const bucket = bySample.get(row.sampleCode);
    if (bucket) bucket.push(row);
    else bySample.set(row.sampleCode, [row]);
  }

  let promotedSamples = 0;
  let promotedResults = 0;
  for (const [sampleCode, sampleRows] of bySample) {
    let samplePointId: string | null = null;
    if (collectionOrderId) {
      const pointResult = await client.query<{ id: string }>(
        `SELECT id::text FROM sample_points WHERE tenant_id = $1::uuid AND collection_order_id = $2::uuid AND code = $3`,
        [input.tenantId, collectionOrderId, sampleCode],
      );
      samplePointId = pointResult.rows[0]?.id ?? null;
    }

    const sampleResult = await client.query<{ id: string }>(
      `INSERT INTO lab_samples (tenant_id, analysis_id, sample_point_id, laboratory_code)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
       ON CONFLICT (tenant_id, analysis_id, laboratory_code)
       DO UPDATE SET sample_point_id = COALESCE(EXCLUDED.sample_point_id, lab_samples.sample_point_id)
       RETURNING id::text`,
      [input.tenantId, input.analysisId, samplePointId, sampleCode],
    );
    const labSampleId = sampleResult.rows[0].id;
    promotedSamples += 1;

    for (const row of sampleRows) {
      await client.query(
        `INSERT INTO lab_results (tenant_id, lab_sample_id, parameter_code, numeric_value, unit, analytical_method, source, original_payload)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'MEASURED', $7::jsonb)
         ON CONFLICT (tenant_id, lab_sample_id, parameter_code, analytical_method)
         DO UPDATE SET numeric_value = EXCLUDED.numeric_value, unit = EXCLUDED.unit, original_payload = EXCLUDED.original_payload`,
        [
          input.tenantId,
          labSampleId,
          row.parameterCode,
          row.value,
          row.unit,
          row.method,
          JSON.stringify({ sourceLine: row.sourceLine, importId: input.importId, unitInferred: row.unitInferred, methodInferred: row.methodInferred }),
        ],
      );
      promotedResults += 1;
    }
  }

  return { promotedSamples, promotedResults };
}

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
  const stored = await saveRawImportFile({
    tenantId: input.tenantId,
    analysisId: input.analysisId,
    fileName: input.fileName,
    content: input.content,
    encoding: isSpreadsheet ? "base64" : "utf8",
  });

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

    const promoted = await promoteRowsToLabResults(client, {
      tenantId: input.tenantId,
      analysisId: input.analysisId,
      importId,
      rows: preview.rows,
      issues: preview.issues,
    });

    await client.query(
      `UPDATE analyses
       SET status = $3::analysis_status,
           source_type = $6,
           source_file_key = coalesce($7, source_file_key),
           confidence_score = $4,
           confidence_level = $5,
           updated_at = now()
       WHERE tenant_id = $1::uuid AND id = $2::uuid`,
      [
        input.tenantId,
        input.analysisId,
        preview.blockers > 0 ? "INCONSISTENT" : "IMPORTED",
        preview.confidence.score,
        preview.confidence.level,
        isSpreadsheet ? "XLSX" : "CSV",
        stored?.key ?? null,
      ],
    );

    await writeAudit(client, {
      tenantId: input.tenantId,
      userId: input.userId,
      action: "LAB_IMPORT_COMMITTED",
      entityType: "analysis",
      entityId: input.analysisId,
      metadata: {
        importId,
        sha256,
        blockers: preview.blockers,
        warnings: preview.warnings,
        promotedSamples: promoted.promotedSamples,
        promotedResults: promoted.promotedResults,
      },
    });

    return { importId, preview, analysisStatus: preview.blockers > 0 ? "INCONSISTENT" : "IMPORTED", promoted };
  });
}
