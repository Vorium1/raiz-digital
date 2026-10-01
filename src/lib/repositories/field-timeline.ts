import { withTenant } from "@/lib/db";
import type { FieldTimeline, TimelineCategory, TimelineEvent, TimelineReference } from "@/domain/field-timeline";

type TimelineRow = {
  kind: string;
  id: string;
  occurredAt: string | null;
  seasonId: string | null;
  analysisId: string | null;
  responsibleName: string | null;
  data: Record<string, unknown>;
};
const text = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;

/** Existing persisted records only. No rule execution, date matching or inferred import ancestry. */
export async function getFieldTimeline(tenantId: string, fieldId: string, userId?: string): Promise<FieldTimeline | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fieldId)) return null;
  return withTenant({ tenantId, userId }, async (client) => {
    const field = await client.query("SELECT id FROM fields WHERE tenant_id = $1::uuid AND id = $2::uuid", [tenantId, fieldId]);
    if (!field.rows[0]) return null;
    const seasons = await client.query<{ id: string; label: string }>(
      `SELECT id::text, season_label AS label FROM crop_seasons
       WHERE tenant_id = $1::uuid AND field_id = $2::uuid ORDER BY created_at DESC, id`, [tenantId, fieldId],
    );
    const result = await client.query<TimelineRow>(
      `WITH s AS (
         SELECT * FROM crop_seasons WHERE tenant_id = $1::uuid AND field_id = $2::uuid
       ), a AS (
         SELECT a.* FROM analyses a JOIN s ON s.tenant_id = a.tenant_id AND s.id = a.crop_season_id
         WHERE a.tenant_id = $1::uuid
       ), i AS (
         SELECT i.*, a.crop_season_id FROM interpretations i
         JOIN a ON a.tenant_id = i.tenant_id AND a.id = i.analysis_id WHERE i.tenant_id = $1::uuid
       ), g AS (
         SELECT g.*, a.crop_season_id FROM ai_generations g
         JOIN a ON a.tenant_id = g.tenant_id AND a.id = g.analysis_id
         WHERE g.tenant_id = $1::uuid AND g.kind = 'AGRONOMIC_PRESCRIPTION'
       ), records AS (
         SELECT 'season' AS kind, id::text AS id, created_at::text AS at,
                id::text AS season_id, NULL::text AS analysis_id, NULL::uuid AS actor,
                jsonb_build_object('label',season_label) AS data FROM s
         UNION ALL
         SELECT 'collection', co.id::text, co.created_at::text, co.crop_season_id::text, NULL, NULL,
                jsonb_build_object('code',co.code) FROM collection_orders co
         JOIN s ON s.tenant_id=co.tenant_id AND s.id=co.crop_season_id WHERE co.tenant_id=$1::uuid
         UNION ALL
         SELECT 'planned', co.id::text, co.planned_at::text, co.crop_season_id::text, NULL, NULL,
                jsonb_build_object('code',co.code) FROM collection_orders co
         JOIN s ON s.tenant_id=co.tenant_id AND s.id=co.crop_season_id WHERE co.tenant_id=$1::uuid AND co.planned_at IS NOT NULL
         UNION ALL
         SELECT 'point', sp.id::text, sp.collected_at::text, co.crop_season_id::text, NULL, sp.collected_by,
                jsonb_build_object('code',sp.code,'orderId',co.id) FROM sample_points sp
         JOIN collection_orders co ON co.tenant_id=sp.tenant_id AND co.id=sp.collection_order_id
         JOIN s ON s.tenant_id=co.tenant_id AND s.id=co.crop_season_id
         WHERE sp.tenant_id=$1::uuid AND sp.collected_at IS NOT NULL
         UNION ALL
         SELECT 'analysis', id::text, created_at::text, crop_season_id::text, id::text, created_by,
                jsonb_build_object('code',code) FROM a
         UNION ALL
         SELECT stage.kind, ai.id::text, stage.at, a.crop_season_id::text, a.id::text,
                CASE WHEN stage.kind='import' THEN ai.created_by ELSE NULL::uuid END,
                jsonb_build_object('format',ai.source_format) FROM analysis_imports ai
         JOIN a ON a.tenant_id=ai.tenant_id AND a.id=ai.analysis_id
         CROSS JOIN LATERAL (VALUES ('import',ai.created_at::text),('import-committed',ai.committed_at::text)) stage(kind,at)
         WHERE ai.tenant_id=$1::uuid AND (stage.kind='import' OR stage.at IS NOT NULL)
         UNION ALL
         SELECT 'source-verified', v.id::text, v.verified_at::text, a.crop_season_id::text, a.id::text, v.verified_by,
                jsonb_build_object('importId',v.import_id) FROM analysis_source_verifications v
         JOIN a ON a.tenant_id=v.tenant_id AND a.id=v.analysis_id WHERE v.tenant_id=$1::uuid
         UNION ALL
         SELECT stage.kind,i.id::text,stage.at,i.crop_season_id::text,i.analysis_id::text,stage.actor,
                jsonb_build_object('revision',i.revision,'ruleCode',i.structured_output->'trace'->>'cropProfileCode',
                  'ruleVersion',i.structured_output->'trace'->>'cropProfileVersion',
                  'ruleHash',i.structured_output->'trace'->>'cropProfileContentHash') FROM i
         CROSS JOIN LATERAL (VALUES ('interpretation',i.created_at::text,NULL::uuid),
           ('interpretation-reviewed',i.reviewed_at::text,i.reviewed_by),
           ('interpretation-approved',i.approved_at::text,i.approved_by)) stage(kind,at,actor)
         WHERE stage.kind='interpretation' OR stage.at IS NOT NULL
         UNION ALL
         SELECT 'rule-execution',re.id::text,re.created_at::text,
                (CASE WHEN re.crop_season_id IS NOT NULL THEN s.id ELSE a.crop_season_id END)::text,
                a.id::text,re.created_by,
                jsonb_build_object('ruleCode',re.rule_id,'ruleVersion',re.rule_version,'sourceSnapshotId',re.source_snapshot_id)
         FROM agronomic_rule_executions re
         LEFT JOIN a ON a.tenant_id=re.tenant_id AND a.id=re.analysis_id
         LEFT JOIN s ON s.tenant_id=re.tenant_id AND s.id=re.crop_season_id
         WHERE re.tenant_id=$1::uuid AND (a.id IS NOT NULL OR s.id IS NOT NULL)
           AND (re.analysis_id IS NULL OR a.id IS NOT NULL)
         UNION ALL
         SELECT stage.kind,g.id::text,stage.at,g.crop_season_id::text,g.analysis_id::text,stage.actor,
                jsonb_build_object('interpretationId',linked.id) FROM g
         LEFT JOIN i linked ON linked.tenant_id=g.tenant_id AND linked.id=g.interpretation_id AND linked.analysis_id=g.analysis_id
         CROSS JOIN LATERAL (VALUES ('prescription',g.created_at::text,g.created_by),
           ('prescription-reviewed',g.reviewed_at::text,g.reviewed_by)) stage(kind,at,actor)
         WHERE stage.kind='prescription' OR stage.at IS NOT NULL
         UNION ALL
         SELECT 'report',r.id::text,r.published_at::text,i.crop_season_id::text,i.analysis_id::text,r.published_by,
                jsonb_build_object('revision',r.revision,'interpretationId',i.id)
         FROM reports r JOIN i ON i.tenant_id=r.tenant_id AND i.id=r.interpretation_id WHERE r.tenant_id=$1::uuid
         UNION ALL
         SELECT 'recommendation',ir.id::text,ir.calculated_at::text,a.crop_season_id::text,a.id::text,NULL,
                jsonb_build_object('inputType',ir.input_type,'quantity',ir.quantity,'unit',ir.unit,'generationId',linked.id)
         FROM input_recommendations ir JOIN a ON a.tenant_id=ir.tenant_id AND a.id=ir.analysis_id
         LEFT JOIN g linked ON linked.tenant_id=ir.tenant_id AND linked.id=ir.source_generation_id AND linked.analysis_id=ir.analysis_id
         WHERE ir.tenant_id=$1::uuid
         UNION ALL
         SELECT 'commercial-scenario',cps.id::text,cps.created_at::text,a.crop_season_id::text,a.id::text,cps.created_by,
                jsonb_build_object('label',cps.label,'mode',cps.simulation_mode)
         FROM commercial_plan_snapshots cps JOIN a ON a.tenant_id=cps.tenant_id AND a.id=cps.analysis_id
         WHERE cps.tenant_id=$1::uuid
         UNION ALL
         SELECT 'application',ia.id::text,coalesce(ia.applied_at::text,ia.created_at::text),a.crop_season_id::text,a.id::text,ia.applied_by,
                jsonb_build_object('inputType',ia.input_type,'quantity',ia.quantity,'unit',ia.unit,'eventDate',ia.applied_at IS NOT NULL)
         FROM input_applications ia JOIN a ON a.tenant_id=ia.tenant_id AND a.id=ia.analysis_id WHERE ia.tenant_id=$1::uuid
         UNION ALL
         SELECT 'yield',fy.id::text,fy.created_at::text,NULL,NULL,fy.created_by,
                jsonb_build_object('label',fy.season_label,'quantity',fy.yield_value,'unit',fy.yield_unit)
         FROM field_yield_history fy WHERE fy.tenant_id=$1::uuid AND fy.field_id=$2::uuid
         UNION ALL
         SELECT 'ndvi',n.id::text,n.captured_at::text,NULL,NULL,NULL::uuid,
                jsonb_build_object('mean',n.mean_ndvi,'source',n.source)
         FROM field_ndvi_snapshots n WHERE n.tenant_id=$1::uuid AND n.field_id=$2::uuid
         UNION ALL
         SELECT 'audit',ae.id::text,ae.created_at::text,coalesce(i.crop_season_id,g.crop_season_id)::text,
                coalesce(i.analysis_id,g.analysis_id)::text,ae.actor_user_id,
                jsonb_build_object('originType',ae.entity_type,'originId',ae.entity_id)
         FROM audit_events ae
         LEFT JOIN i ON ae.entity_type='interpretation' AND i.tenant_id=ae.tenant_id AND i.id=ae.entity_id
         LEFT JOIN g ON ae.entity_type='ai_generation' AND g.tenant_id=ae.tenant_id AND g.id=ae.entity_id
         WHERE ae.tenant_id=$1::uuid
           AND ((i.id IS NOT NULL AND ae.action IN ('INTERPRETATION_APPROVED','INTERPRETATION_REVIEWED')
                 AND NOT ((ae.action='INTERPRETATION_APPROVED' AND ae.created_at IS NOT DISTINCT FROM i.approved_at)
                       OR (ae.action='INTERPRETATION_REVIEWED' AND ae.created_at IS NOT DISTINCT FROM i.reviewed_at)))
             OR (g.id IS NOT NULL AND ae.action='AI_AGRONOMIC_PRESCRIPTION_REVIEWED'
                 AND ae.created_at IS DISTINCT FROM g.reviewed_at))
       ) SELECT records.kind,records.id,records.at AS "occurredAt",records.season_id AS "seasonId",
                records.analysis_id AS "analysisId",actor.name AS "responsibleName",records.data
         FROM records LEFT JOIN users actor ON actor.id=records.actor`,
      [tenantId, fieldId],
    );
    let undatedCount = 0;
    const events: TimelineEvent[] = [];
    for (const row of result.rows) {
      if (!row.occurredAt || !Number.isFinite(Date.parse(row.occurredAt))) { undatedCount++; continue; }
      events.push(toEvent(row, fieldId));
    }
    events.sort((left,right) => Date.parse(right.occurredAt)-Date.parse(left.occurredAt) || left.id.localeCompare(right.id));
    return { fieldId, events, seasons: seasons.rows, undatedCount };
  });
}

function toEvent(row: TimelineRow, fieldId: string): TimelineEvent {
  const d = row.data;
  const analysisHref = row.analysisId ? `/analises/${row.analysisId}` : `/talhoes/${fieldId}?aba=timeline`;
  const ref = (entityType: string, id: string, label: string, href = analysisHref): TimelineReference => ({ entityType,id,label,href });
  const limitations: string[] = [];
  const evidenceRefs: TimelineReference[] = [];
  let category: TimelineCategory = "FOLLOWUP";
  let entityType = row.kind;
  let title = "Registro de acompanhamento";
  let detail = "Registro persistido no talhão.";
  let dateBasis: TimelineEvent["dateBasis"] = "EVENT";
  let href = analysisHref;
  let rule: TimelineEvent["rule"] = null;
  const interpretationId = text(d.interpretationId);
  const generationId = text(d.generationId);
  const revision = typeof d.revision === "number" ? `Revisão ${d.revision}` : "Revisão registrada";
  switch (row.kind) {
    case "season": category="SEASON"; entityType="crop_season"; title=`Safra cadastrada — ${text(d.label) ?? "sem rótulo"}`; dateBasis="REGISTERED"; break;
    case "collection": case "planned": category="COLLECTION"; entityType="collection_order"; title=`${row.kind==="planned" ? "Coleta planejada" : "Ordem cadastrada"} — ${text(d.code) ?? row.id}`; dateBasis=row.kind==="planned" ? "EVENT" : "REGISTERED"; href=`/coletas?ordem=${row.id}`; break;
    case "point": category="COLLECTION"; entityType="sample_point"; title=`Ponto coletado — ${text(d.code) ?? row.id}`; if (text(d.orderId)) evidenceRefs.push(ref("collection_order",text(d.orderId)!,"Ordem de coleta",`/coletas?ordem=${text(d.orderId)}`)); break;
    case "analysis": category="LAB"; entityType="analysis"; title=`Análise cadastrada — ${text(d.code) ?? row.id}`; dateBasis="REGISTERED"; break;
    case "import": case "import-committed": category="LAB"; entityType="analysis_import"; title=row.kind==="import" ? "Importação cadastrada" : "Laudo importado"; detail=`Formato registrado: ${text(d.format) ?? "não informado"}.`; dateBasis=row.kind==="import" ? "REGISTERED" : "EVENT"; if (row.kind==="import-committed") limitations.push("Responsável pelo commit não é preservado nesta importação; o criador do cadastro não é atribuído à confirmação."); break;
    case "source-verified": category="LAB"; entityType="analysis_source_verification"; title="Fonte laboratorial conferida"; if (text(d.importId)) evidenceRefs.push(ref("analysis_import",text(d.importId)!,"Importação conferida")); break;
    case "interpretation": case "interpretation-reviewed": case "interpretation-approved":
      category=row.kind==="interpretation" ? "RULE" : "DECISION"; entityType="interpretation";
      title=row.kind==="interpretation" ? "Interpretação calculada" : row.kind==="interpretation-approved" ? "Aprovação registrada" : "Revisão registrada";
      detail=revision;
      rule={code:text(d.ruleCode),version:text(d.ruleVersion),hash:text(d.ruleHash)};
      if (!rule.code && !rule.version && !rule.hash) { rule=null; limitations.push("Esta revisão não preservou identificação da regra aplicada."); }
      else if (!rule.version || !rule.hash) limitations.push("Versão ou hash da regra não foi preservado nesta revisão.");
      limitations.push("Não há vínculo imutável entre esta revisão e uma importação específica; laudos não são associados por data.");
      if (row.kind!=="interpretation") evidenceRefs.push(ref("interpretation",row.id,"Interpretação revisada"));
      break;
    case "rule-execution": category="RULE"; entityType="agronomic_rule_execution"; title="Regra agronômica executada";
      rule={code:text(d.ruleCode),version:text(d.ruleVersion),hash:null};
      if (text(d.sourceSnapshotId)) evidenceRefs.push(ref("source_snapshot",text(d.sourceSnapshotId)!,"Referência de fonte preservada"));
      limitations.push("Esta execução preserva identificação e versão da regra; não registra hash criptográfico da regra.");
      break;
    case "prescription": case "prescription-reviewed": category="DECISION"; entityType="ai_generation"; title=row.kind==="prescription" ? "Rascunho de prescrição gerado" : "Revisão de prescrição registrada"; detail="O estado atual não é apresentado como decisão histórica."; if (interpretationId) evidenceRefs.push(ref("interpretation",interpretationId,"Interpretação vinculada")); else limitations.push("Interpretação de origem não vinculada a esta análise."); if (row.kind==="prescription-reviewed") evidenceRefs.push(ref("ai_generation",row.id,"Prescrição revisada")); break;
    case "report": category="DELIVERY"; entityType="report"; title="Relatório publicado"; detail=revision; if (interpretationId) evidenceRefs.push(ref("interpretation",interpretationId,"Interpretação publicada")); limitations.push("A abertura da análise mostra seu estado atual; esta linha identifica a publicação histórica pelo ID e revisão."); break;
    case "recommendation": category="DECISION"; entityType="input_recommendation"; title="Recomendação registrada"; detail=`${text(d.inputType) ?? "Insumo"}: ${String(d.quantity)} ${text(d.unit) ?? ""}`; if (generationId) evidenceRefs.push(ref("ai_generation",generationId,"Prescrição de origem")); else limitations.push("Prescrição de origem não foi preservada neste registro."); break;
    case "commercial-scenario": category="DECISION"; entityType="commercial_plan_snapshot"; title="Cenário comercial salvo"; detail=text(d.label) ?? "Simulação comercial registrada."; dateBasis="REGISTERED"; limitations.push("Salvar um cenário não comprova aprovação profissional ou publicação da recomendação."); break;
    case "application": entityType="input_application"; title="Aplicação registrada"; detail=`${text(d.inputType) ?? "Insumo"}: ${String(d.quantity)} ${text(d.unit) ?? ""}`; dateBasis=d.eventDate===true ? "EVENT" : "REGISTERED"; limitations.push("Aplicação vinculada à análise, sem associação inferida a uma recomendação específica."); break;
    case "yield": entityType="field_yield_history"; title="Produtividade cadastrada"; detail=`${text(d.label) ?? "Safra informada"}: ${String(d.quantity)} ${text(d.unit) ?? ""}`; dateBasis="REGISTERED"; limitations.push("Rótulo de safra informado sem vínculo com uma safra cadastrada; histórico do talhão."); break;
    case "ndvi": entityType="field_ndvi_snapshot"; title="Leitura de satélite"; detail=`NDVI médio ${String(d.mean)} · ${text(d.source) ?? "fonte não informada"}`; limitations.push("Leitura vinculada ao talhão, sem vínculo de safra.","Solicitante da leitura não é atribuído como responsável pela captura do satélite."); break;
    case "audit": category="DECISION"; entityType="audit_event"; title="Evento de revisão auditado"; detail="Registro histórico de revisão; conteúdo e estado passados não foram reconstruídos."; if (text(d.originId) && text(d.originType)) evidenceRefs.push(ref(text(d.originType)!,text(d.originId)!,"Registro de origem")); limitations.push("A auditoria comprova a ocorrência, mas não congela o conteúdo da revisão."); break;
  }
  if (["interpretation", "prescription", "ai_generation", "input_recommendation", "agronomic_rule_execution", "commercial_plan_snapshot"].includes(entityType)) {
    limitations.push("O link abre o contexto atual da análise; o registro histórico é identificado pelo ID de origem desta linha.");
  }
  if (row.analysisId && row.kind!=="analysis") evidenceRefs.push(ref("analysis",row.analysisId,"Análise vinculada"));
  return { id:`${row.kind}:${row.id}`,category,occurredAt:row.occurredAt!,dateBasis,seasonId:row.seasonId,analysisId:row.analysisId,title,detail,
    source:{entityType,id:row.id,href},responsibleName:row.responsibleName,rule,evidenceRefs,limitations };
}
