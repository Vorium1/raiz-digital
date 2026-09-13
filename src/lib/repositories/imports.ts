import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { buildLabImportPreview, buildLabImportPreviewFromXlsxBase64, isSpreadsheetFileName, type LabImportIssue, type LabImportRow } from "@/domain/lab-import";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { saveRawImportFile, unwrapExtractedLabContent, verifyRawImportArchive } from "@/lib/storage";

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
  // PDF/foto chega como CSV transcrito, mas pode carregar um envelope de proveniência criado pelo servidor
  // no /api/import/extract. O envelope nunca entra no parser agronômico; ele só referencia o original já
  // arquivado, que é relido e conferido por hash/bytes antes do commit.
  const transported = unwrapExtractedLabContent(input.content);
  const sourceReceipt = transported.source;
  const normalizedContent = transported.content;
  const isSpreadsheet = !sourceReceipt && isSpreadsheetFileName(input.fileName);
  const originalFileName = sourceReceipt?.fileName ?? input.fileName;

  const importContext = {
    fallbackMethod: input.fallbackMethod,
    hasAgronomicContext: input.hasAgronomicContext,
    spatialLinked: input.spatialLinked,
  };
  const preview = isSpreadsheet
    ? buildLabImportPreviewFromXlsxBase64(normalizedContent, input.fileName, importContext)
    : buildLabImportPreview(normalizedContent, input.fileName, importContext);

  let stored: { key: string; bytes: number; sha256: string } | null;
  let sourceFormat: "CSV_LONG" | "CSV_WIDE" | "XLSX" | "PDF_OCR";
  let analysisSourceType: "CSV" | "XLSX" | "PDF_OCR";

  if (sourceReceipt) {
    await verifyRawImportArchive({ tenantId: input.tenantId, source: sourceReceipt });
    stored = sourceReceipt;
    sourceFormat = "PDF_OCR";
    analysisSourceType = "PDF_OCR";
  } else {
    stored = await saveRawImportFile({
      tenantId: input.tenantId,
      analysisId: input.analysisId,
      fileName: originalFileName,
      content: normalizedContent,
      encoding: isSpreadsheet ? "base64" : "utf8",
    });
    sourceFormat = isSpreadsheet ? "XLSX" : preview.format === "LONG" ? "CSV_LONG" : "CSV_WIDE";
    analysisSourceType = isSpreadsheet ? "XLSX" : "CSV";
  }

  // Hash de proveniência sempre representa os BYTES ORIGINAIS, não a string base64 de um XLSX nem o CSV
  // produzido por OCR. Se o provider bruto está indisponível em desenvolvimento, calculamos os mesmos bytes
  // localmente para manter a identidade do arquivo sem fingir que ele foi arquivado.
  const rawBuffer = sourceReceipt
    ? null
    : Buffer.from(normalizedContent, isSpreadsheet ? "base64" : "utf8");
  const sourceSha256 = stored?.sha256 ?? createHash("sha256").update(rawBuffer as Buffer).digest("hex");
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
        originalFileName,
        sourceSha256,
        sourceFormat,
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
        analysisSourceType,
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
        sha256: sourceSha256,
        sourceFormat,
        sourceArchived: Boolean(stored),
        sourceFileKey: stored?.key ?? null,
        blockers: preview.blockers,
        warnings: preview.warnings,
        promotedSamples: promoted.promotedSamples,
        promotedResults: promoted.promotedResults,
      },
    });

    return { importId, preview, analysisStatus: preview.blockers > 0 ? "INCONSISTENT" : "IMPORTED", promoted };
  });
}
