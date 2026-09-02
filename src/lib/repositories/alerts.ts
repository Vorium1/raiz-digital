import { withTenant } from "@/lib/db";

export type AlertCriticality = "ALTA" | "MEDIA" | "BAIXA";

export type OperationalAlert = {
  id: string;
  category: string;
  criticality: AlertCriticality;
  title: string;
  description: string;
  href: string;
  context: string;
};

/**
 * Central de alertas: cada item vem de uma consulta real contra o banco.
 * Nenhum alerta é decorativo -- se a lista de uma categoria vier vazia, ela
 * simplesmente não aparece.
 */
export async function listOperationalAlerts(tenantId: string, userId?: string): Promise<OperationalAlert[]> {
  return withTenant({ tenantId, userId }, async (client) => {
    const alerts: OperationalAlert[] = [];

    const overdueOrders = await client.query(
      `SELECT co.id::text, co.code, co.planned_at::text AS "plannedAt", f.name AS "fieldName", c.name AS "clientName"
       FROM collection_orders co
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE co.tenant_id = $1::uuid AND co.status IN ('PLANNED','IN_PROGRESS') AND co.planned_at IS NOT NULL AND co.planned_at < now()`,
      [tenantId],
    );
    for (const row of overdueOrders.rows) {
      alerts.push({
        id: `overdue-order-${row.id}`, category: "Coleta atrasada", criticality: "ALTA",
        title: `${row.code} está atrasada`, description: `${row.clientName} · ${row.fieldName} — planejada para ${new Date(row.plannedAt).toLocaleDateString("pt-BR")}`,
        href: `/coletas`, context: row.fieldName,
      });
    }

    const pendingPoints = await client.query(
      `SELECT co.id::text, co.code, f.name AS "fieldName", c.name AS "clientName",
              count(sp.*) FILTER (WHERE sp.collected_at IS NULL)::int AS pending, count(sp.*)::int AS total
       FROM collection_orders co
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       JOIN sample_points sp ON sp.tenant_id = co.tenant_id AND sp.collection_order_id = co.id
       WHERE co.tenant_id = $1::uuid AND co.status IN ('PLANNED','IN_PROGRESS')
       GROUP BY co.id, co.code, f.name, c.name HAVING count(sp.*) FILTER (WHERE sp.collected_at IS NULL) > 0`,
      [tenantId],
    );
    for (const row of pendingPoints.rows) {
      alerts.push({
        id: `pending-points-${row.id}`, category: "Pontos não coletados", criticality: row.pending === row.total ? "MEDIA" : "BAIXA",
        title: `${row.pending} de ${row.total} pontos pendentes`, description: `${row.clientName} · ${row.fieldName} — ordem ${row.code}`,
        href: `/coletas`, context: row.fieldName,
      });
    }

    const awaitingLab = await client.query(
      `SELECT a.id::text, a.code, f.name AS "fieldName", c.name AS "clientName", a.updated_at::text AS "updatedAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE a.tenant_id = $1::uuid AND a.status = 'AWAITING_LAB'`,
      [tenantId],
    );
    for (const row of awaitingLab.rows) {
      alerts.push({
        id: `awaiting-lab-${row.id}`, category: "Laudo aguardando importação", criticality: "MEDIA",
        title: `${row.code} sem laudo importado`, description: `${row.clientName} · ${row.fieldName} — desde ${new Date(row.updatedAt).toLocaleDateString("pt-BR")}`,
        href: `/analises/${row.id}`, context: row.fieldName,
      });
    }

    const inconsistent = await client.query(
      `SELECT a.id::text, a.code, f.name AS "fieldName", c.name AS "clientName"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE a.tenant_id = $1::uuid AND a.status = 'INCONSISTENT'`,
      [tenantId],
    );
    for (const row of inconsistent.rows) {
      alerts.push({
        id: `inconsistent-${row.id}`, category: "Dados inválidos", criticality: "ALTA",
        title: `${row.code} tem laudo com bloqueio`, description: `${row.clientName} · ${row.fieldName} — linhas com unidade/método/valor inválido`,
        href: `/analises/${row.id}`, context: row.fieldName,
      });
    }

    const awaitingReview = await client.query(
      `SELECT i.id::text, i.analysis_id::text AS "analysisId", a.code, f.name AS "fieldName", c.name AS "clientName"
       FROM interpretations i
       JOIN analyses a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE i.tenant_id = $1::uuid AND i.status = 'IN_REVIEW'
         AND i.revision = (SELECT max(revision) FROM interpretations i2 WHERE i2.tenant_id = i.tenant_id AND i2.analysis_id = i.analysis_id)`,
      [tenantId],
    );
    for (const row of awaitingReview.rows) {
      alerts.push({
        id: `awaiting-review-${row.id}`, category: "Interpretação aguardando revisão", criticality: "MEDIA",
        title: `${row.code} aguarda validação técnica`, description: `${row.clientName} · ${row.fieldName}`,
        href: `/analises/${row.analysisId}`, context: row.fieldName,
      });
    }

    const unhomologatedParams = await client.query(
      `SELECT cp.id::text, cp.name, count(*)::int AS pending
       FROM crop_profile_parameters cpp JOIN crop_profiles cp ON cp.id = cpp.crop_profile_id
       WHERE cpp.status != 'ACTIVE'
       GROUP BY cp.id, cp.name`,
    );
    for (const row of unhomologatedParams.rows) {
      alerts.push({
        id: `unhomologated-${row.id}`, category: "Parâmetro sem regra homologada", criticality: "BAIXA",
        title: `${row.pending} parâmetro(s) de ${row.name} aguardando homologação`, description: "Faixas de suficiência ainda não aprovadas por um agrônomo responsável.",
        href: "/biblioteca-tecnica", context: row.name,
      });
    }

    const seasonsWithoutCrop = await client.query(
      `SELECT cs.id::text, cs.season_label AS "seasonLabel", f.name AS "fieldName", c.name AS "clientName"
       FROM crop_seasons cs
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE cs.tenant_id = $1::uuid AND cs.crop_profile_id IS NULL`,
      [tenantId],
    );
    for (const row of seasonsWithoutCrop.rows) {
      alerts.push({
        id: `season-no-crop-${row.id}`, category: "Talhão sem cultura definida", criticality: "MEDIA",
        title: `${row.fieldName} · ${row.seasonLabel} sem cultura vinculada`, description: `${row.clientName} — o motor não consegue interpretar sem cultura do catálogo.`,
        href: "/coletas#safras", context: row.fieldName,
      });
    }

    const fieldsWithoutSeason = await client.query(
      `SELECT f.id::text, f.name, c.name AS "clientName"
       FROM fields f
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE f.tenant_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM crop_seasons cs WHERE cs.tenant_id = f.tenant_id AND cs.field_id = f.id)`,
      [tenantId],
    );
    for (const row of fieldsWithoutSeason.rows) {
      alerts.push({
        id: `field-no-season-${row.id}`, category: "Talhão sem safra definida", criticality: "BAIXA",
        title: `${row.name} sem nenhuma safra cadastrada`, description: `${row.clientName}`,
        href: "/coletas#safras", context: row.name,
      });
    }

    const staleAnalyses = await client.query(
      `SELECT a.id::text, a.code, a.status, f.name AS "fieldName", c.name AS "clientName", a.created_at::text AS "createdAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE a.tenant_id = $1::uuid AND a.status IN ('DRAFT','COLLECTION_SCHEDULED','COLLECTION_IN_PROGRESS','AWAITING_LAB')
         AND a.created_at < now() - interval '14 days'`,
      [tenantId],
    );
    for (const row of staleAnalyses.rows) {
      alerts.push({
        id: `stale-${row.id}`, category: "Análise incompleta", criticality: "BAIXA",
        title: `${row.code} parada há mais de 14 dias`, description: `${row.clientName} · ${row.fieldName} — status atual: ${row.status}`,
        href: `/analises/${row.id}`, context: row.fieldName,
      });
    }

    const brokenTraceability = await client.query(
      `SELECT ls.id::text, ls.laboratory_code, a.id::text AS "analysisId", a.code AS "analysisCode", f.name AS "fieldName", c.name AS "clientName"
       FROM lab_samples ls
       JOIN analyses a ON a.tenant_id = ls.tenant_id AND a.id = ls.analysis_id
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE ls.tenant_id = $1::uuid AND ls.sample_point_id IS NULL AND a.collection_order_id IS NOT NULL`,
      [tenantId],
    );
    for (const row of brokenTraceability.rows) {
      alerts.push({
        id: `broken-trace-${row.id}`, category: "Inconsistência de rastreabilidade", criticality: "ALTA",
        title: `Amostra ${row.laboratory_code} sem ponto de coleta vinculado`, description: `${row.clientName} · ${row.fieldName} · ${row.analysisCode} — código da amostra não bate com nenhum ponto da ordem.`,
        href: `/analises/${row.analysisId}`, context: row.fieldName,
      });
    }

    const order = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
    return alerts.sort((a, b) => order[a.criticality] - order[b.criticality]);
  });
}
