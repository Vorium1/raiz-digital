import { withTenant } from "@/lib/db";

/**
 * Pacote de evidências: o único objeto que qualquer provedor de IA
 * agronômica recebe. Nunca dá acesso direto ao banco — tudo aqui já
 * passou por autenticação, RBAC e filtro de tenant antes de existir.
 * Cada campo é dado real persistido ou `null`; nada é inferido aqui.
 */
export type AgronomicEvidencePackage = {
  tenant: { id: string; name: string };
  client: { id: string; name: string };
  property: { id: string; name: string; municipality: string; state: string };
  field: { id: string; name: string; areaHa: number };
  season: {
    id: string; label: string; crop: string | null; cropGroup: string | null; cultivar: string | null;
    managementSystem: string | null; soilTexture: string | null; yieldGoal: number | null; yieldGoalUnit: string | null;
  };
  region: { code: string | null };
  analysis: { id: string; code: string; status: string; createdAt: string };
  results: Array<{ sampleCode: string; parameterCode: string; value: number; unit: string; method: string }>;
  classifications: Array<{ sampleCode: string; parameterCode: string; interpretable: boolean; classification: string | null; reason: string | null }>;
  ruleUsed: { cropProfileCode: string | null; cropProfileName: string | null; version: string | null; contentHash: string | null } | null;
  confidence: { score: number; level: string } | null;
  technicalSources: Array<{ title: string; institution: string | null; editionYear: number | null; subject: string | null }>;
  history: Array<{ analysisCode: string; seasonLabel: string; createdAt: string; parameterCode: string; classification: string }>;
  reviewStatus: string | null;
};

/**
 * Monta o pacote a partir de uma análise já interpretada. Retorna `null`
 * quando a análise não existe (ou não pertence ao tenant da sessão, via
 * RLS) -- nunca lança um erro que possa vazar existência de outro tenant.
 */
export async function buildAgronomicEvidencePackage(tenantId: string, userId: string, analysisId: string): Promise<AgronomicEvidencePackage | null> {
  return withTenant({ tenantId, userId }, async (client) => {
    const tenantResult = await client.query(`SELECT id::text, trade_name AS name FROM tenants WHERE id = $1::uuid`, [tenantId]);
    const tenant = tenantResult.rows[0];
    if (!tenant) return null;

    const baseResult = await client.query(
      `SELECT a.id::text, a.code, a.status::text, a.created_at::text AS "createdAt",
              c.id::text AS "clientId", c.name AS "clientName",
              p.id::text AS "propertyId", p.name AS "propertyName", p.municipality, p.state,
              f.id::text AS "fieldId", f.name AS "fieldName", f.area_ha::float8 AS "areaHa",
              cs.id::text AS "seasonId", cs.season_label AS "seasonLabel", cs.current_crop AS "currentCrop",
              cs.cultivar, cs.management_system AS "managementSystem", cs.soil_texture AS "soilTexture",
              cs.yield_goal::float8 AS "yieldGoal", cs.yield_goal_unit AS "yieldGoalUnit", cs.technical_region_code AS "regionCode",
              cs.crop_profile_id::text AS "cropProfileId"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid`,
      [tenantId, analysisId],
    );
    const base = baseResult.rows[0];
    if (!base) return null;

    const resultsResult = await client.query(
      `SELECT ls.laboratory_code AS "sampleCode", lr.parameter_code AS "parameterCode", lr.numeric_value::float8 AS value, lr.unit, lr.analytical_method AS method
       FROM lab_samples ls JOIN lab_results lr ON lr.tenant_id = ls.tenant_id AND lr.lab_sample_id = ls.id
       WHERE ls.tenant_id = $1::uuid AND ls.analysis_id = $2::uuid ORDER BY ls.laboratory_code, lr.parameter_code`,
      [tenantId, analysisId],
    );

    const interpretationResult = await client.query(
      `SELECT i.status, i.structured_output AS "structuredOutput", cp.code AS "cropProfileCode", cp.name AS "cropProfileName",
              cp.semantic_version AS "cropProfileVersion", cp.content_hash AS "cropProfileHash"
       FROM interpretations i LEFT JOIN crop_profiles cp ON cp.id = i.crop_profile_id
       WHERE i.tenant_id = $1::uuid AND i.analysis_id = $2::uuid ORDER BY i.created_at DESC LIMIT 1`,
      [tenantId, analysisId],
    );
    const interpretation = interpretationResult.rows[0];
    const structured = interpretation?.structuredOutput as { interpretation?: Array<{ sampleCode: string; parameterCode: string; interpretable: boolean; classification?: string; reason?: string }>; confidence?: { score: number; level: string } } | undefined;

    const sourcesResult = base.cropProfileId
      ? await client.query(
          `SELECT title, institution, edition_year AS "editionYear", subject FROM technical_sources WHERE crop_profile_id = $1::uuid AND status = 'ACTIVE' ORDER BY title`,
          [base.cropProfileId],
        )
      : { rows: [] };

    const historyResult = await client.query(
      `SELECT a2.code AS "analysisCode", cs2.season_label AS "seasonLabel", i2.created_at::text AS "createdAt", i2.structured_output AS "structuredOutput"
       FROM interpretations i2
       JOIN analyses a2 ON a2.tenant_id = i2.tenant_id AND a2.id = i2.analysis_id
       JOIN crop_seasons cs2 ON cs2.tenant_id = a2.tenant_id AND cs2.id = a2.crop_season_id
       WHERE i2.tenant_id = $1::uuid AND cs2.field_id = $2::uuid AND a2.id != $3::uuid
       ORDER BY i2.created_at DESC LIMIT 5`,
      [tenantId, base.fieldId, analysisId],
    );
    const history: AgronomicEvidencePackage["history"] = [];
    for (const row of historyResult.rows) {
      const rowStructured = row.structuredOutput as { interpretation?: Array<{ parameterCode: string; interpretable: boolean; classification?: string }> } | null;
      for (const item of rowStructured?.interpretation ?? []) {
        if (item.interpretable) history.push({ analysisCode: row.analysisCode, seasonLabel: row.seasonLabel, createdAt: row.createdAt, parameterCode: item.parameterCode, classification: item.classification ?? "" });
      }
    }

    let cropGroup: string | null = null;
    if (base.cropProfileId) {
      const groupResult = await client.query(`SELECT crop_group AS "cropGroup" FROM crop_profiles WHERE id = $1::uuid`, [base.cropProfileId]);
      cropGroup = groupResult.rows[0]?.cropGroup ?? null;
    }

    return {
      tenant: { id: tenant.id, name: tenant.name },
      client: { id: base.clientId, name: base.clientName },
      property: { id: base.propertyId, name: base.propertyName, municipality: base.municipality, state: base.state },
      field: { id: base.fieldId, name: base.fieldName, areaHa: base.areaHa },
      season: {
        id: base.seasonId, label: base.seasonLabel, crop: base.currentCrop, cropGroup, cultivar: base.cultivar,
        managementSystem: base.managementSystem, soilTexture: base.soilTexture, yieldGoal: base.yieldGoal, yieldGoalUnit: base.yieldGoalUnit,
      },
      region: { code: base.regionCode },
      analysis: { id: base.id, code: base.code, status: base.status, createdAt: base.createdAt },
      results: resultsResult.rows,
      classifications: (structured?.interpretation ?? []).map((item) => ({ sampleCode: item.sampleCode, parameterCode: item.parameterCode, interpretable: item.interpretable, classification: item.interpretable ? (item.classification ?? null) : null, reason: item.interpretable ? null : (item.reason ?? null) })),
      ruleUsed: interpretation ? { cropProfileCode: interpretation.cropProfileCode, cropProfileName: interpretation.cropProfileName, version: interpretation.cropProfileVersion, contentHash: interpretation.cropProfileHash } : null,
      confidence: structured?.confidence ?? null,
      technicalSources: sourcesResult.rows,
      history,
      reviewStatus: interpretation?.status ?? null,
    };
  });
}
