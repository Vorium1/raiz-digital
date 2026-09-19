import type { PoolClient } from "pg";
import { buildLabImportPreview, buildLabImportPreviewFromXlsxBase64, isSpreadsheetFileName, type LabImportIssue, type LabImportRow } from "@/domain/lab-import";
import { withTenant } from "@/lib/db";
import { writeAudit } from "@/lib/repositories/audit";
import { refreshAnalysisSourceHumanVerified } from "@/lib/repositories/source-verification";
import { saveRequiredRawImportFile, unwrapExtractedLabContent, verifyRawImportArchive } from "@/lib/storage";

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
          JSON.stringify({
            sourceLine: row.sourceLine,
            importId: input.importId,
            unitInferred: row.unitInferred,
            methodInferred: row.methodInferred,
            methodDerivedFromProtocol: row.methodDerivedFromProtocol,
            protocol: row.protocol || null,
            rawMethod: row.rawMethod || null,
          }),
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
  // O fluxo normal chega com recibo de proveniência assinado: PDF/foto traz o CSV extraído; CSV/XLSX
  // traz o próprio conteúdo validado. Em ambos os casos o recibo vincula tenant + original arquivado +
  // hash exato do conteúdo entregue ao parser. Chamadas diretas sem recibo continuam fail-closed: o
  // original é arquivado aqui antes de qualquer parsing.
  const transported = unwrapExtractedLabContent(input.content, input.tenantId);
  const sourceReceipt = transported.source;
  const normalizedContent = transported.content;
  const originalFileName = sourceReceipt?.fileName ?? input.fileName;
  const isSpreadsheet = sourceReceipt
    ? sourceReceipt.sourceType === "XLSX"
    : isSpreadsheetFileName(input.fileName);

  // Cadeia de custódia fail-closed: a fonte original precisa existir e ter integridade confirmada antes
  // de o parser agronômico examinar o conteúdo ou qualquer linha poder ser promovida.
  const stored = sourceReceipt
    ? await (async () => {
        await verifyRawImportArchive({ tenantId: input.tenantId, source: sourceReceipt });
        return sourceReceipt;
      })()
    : await saveRequiredRawImportFile({
        tenantId: input.tenantId,
        analysisId: input.analysisId,
        fileName: originalFileName,
        content: normalizedContent,
        encoding: isSpreadsheet ? "base64" : "utf8",
      });

  const importContext = {
    fallbackMethod: input.fallbackMethod,
    hasAgronomicContext: input.hasAgronomicContext,
    spatialLinked: input.spatialLinked,
  };
  const preview = isSpreadsheet
    ? buildLabImportPreviewFromXlsxBase64(normalizedContent, originalFileName, importContext)
    : buildLabImportPreview(normalizedContent, originalFileName, importContext);

  const sourceFormat: "CSV_LONG" | "CSV_WIDE" | "XLSX" | "PDF_OCR" = sourceReceipt?.sourceType === "PDF_OCR"
    ? "PDF_OCR"
    : isSpreadsheet
      ? "XLSX"
      : preview.format === "LONG"
        ? "CSV_LONG"
        : "CSV_WIDE";
  const analysisSourceType: "CSV" | "XLSX" | "PDF_OCR" = sourceReceipt?.sourceType
    ?? (isSpreadsheet ? "XLSX" : "CSV");

  // O hash e a chave vêm obrigatoriamente do arquivo original persistido e, quando o preview ocorreu
  // antes, do mesmo recibo assinado que foi emitido após esse arquivamento.
  const sourceSha256 = stored.sha256;
  const persistedStatus = preview.blockers > 0 ? "INCONSISTENT" : "VALIDATED";

  return withTenant({ tenantId: input.tenantId, userId: input.userId }, async (client) => {
    // Serializa mutações da evidência laboratorial com o cálculo/revisão/publicação da mesma análise.
    // O parser e o arquivamento bruto acontecem antes, mas nenhuma linha persistida muda sem este lock.
    // Assim, uma interpretação nunca pode ser criada "depois" de uma importação que ela na verdade não leu.
    const analysisLock = await client.query<{ id: string }>(
      `SELECT id::text FROM analyses
       WHERE tenant_id = $1::uuid AND id = $2::uuid
       FOR UPDATE`,
      [input.tenantId, input.analysisId],
    );
    if (!analysisLock.rows[0]) throw new Error("Análise não encontrada para importação.");

    // `clock_timestamp()` é deliberado: `now()` representa o início da transação e poderia ficar
    // anterior a uma interpretação que terminou enquanto esta importação aguardava o lock da análise.
    const importResult = await client.query<{ id: string }>(
      `INSERT INTO analysis_imports
       (tenant_id, analysis_id, file_name, file_sha256, raw_object_key, source_format, status, detected_headers,
        normalized_row_count, blocker_count, warning_count, confidence_score, validation_issues, created_by, committed_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::import_status, $8::jsonb, $9, $10, $11, $12, $13::jsonb, $14::uuid, clock_timestamp())
       ON CONFLICT (tenant_id, file_sha256, analysis_id)
       DO UPDATE SET file_name = EXCLUDED.file_name,
                     raw_object_key = COALESCE(analysis_imports.raw_object_key, EXCLUDED.raw_object_key),
                     source_format = EXCLUDED.source_format,
                     status = EXCLUDED.status,
                     detected_headers = EXCLUDED.detected_headers,
                     normalized_row_count = EXCLUDED.normalized_row_count,
                     blocker_count = EXCLUDED.blocker_count,
                     warning_count = EXCLUDED.warning_count,
                     confidence_score = EXCLUDED.confidence_score,
                     validation_issues = EXCLUDED.validation_issues,
                     committed_at = clock_timestamp()
       RETURNING id::text`,
      [
        input.tenantId,
        input.analysisId,
        originalFileName,
        sourceSha256,
        stored.key,
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
          JSON.stringify({
            sourceLine: row.sourceLine,
            source: row.source,
            protocol: row.protocol || null,
            rawMethod: row.rawMethod || null,
            methodDerivedFromProtocol: row.methodDerivedFromProtocol,
          }),
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
        stored.key,
      ],
    );

    // Um novo arquivo ou uma proveniência antes ausente pode tornar a confirmação anterior insuficiente.
    // Recalculamos o resumo usando somente confirmações que batem exatamente import + SHA + object key.
    const verificationState = await refreshAnalysisSourceHumanVerified(client, {
      tenantId: input.tenantId,
      analysisId: input.analysisId,
    });

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
        sourceArchived: true,
        sourceFileKey: stored.key,
        sourceHumanVerified: verificationState.verified,
        blockers: preview.blockers,
        warnings: preview.warnings,
        promotedSamples: promoted.promotedSamples,
        promotedResults: promoted.promotedResults,
      },
    });

    return { importId, preview, analysisStatus: preview.blockers > 0 ? "INCONSISTENT" : "IMPORTED", promoted };
  });
}
