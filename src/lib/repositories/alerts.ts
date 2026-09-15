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
  /** Identificador real do talhão (fields.id), quando o alerta tem um -- achado real numa revisão
   * independente: telas que filtravam alertas por NOME de talhão (`context`) misturariam alertas de
   * talhões homônimos (nomes iguais em propriedades/clientes diferentes, cenário real e comum em
   * agricultura -- "Área 01", "Talhão 3" etc.). Null só nas categorias que não têm um talhão associado
   * (ex.: parâmetro de cultura pendente de homologação, que é do catálogo, não de um talhão). */
  fieldId: string | null;
  /** Data pertinente ao alerta (ex.: coleta planejada, laudo pendente desde). Null quando a categoria não
   * tem uma data real associada -- nunca preenchido com "hoje" ou outro valor inventado. */
  date: string | null;
  /** Responsável, só quando de fato registrado (ex.: collection_orders.assigned_to). Null na maioria das
   * categorias -- pedido explícito do briefing: "responsável, somente se registrado", nunca "Não atribuído"
   * fabricado pra preencher a coluna. */
  responsible: string | null;
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
      `SELECT co.id::text, co.code, co.planned_at::text AS "plannedAt", f.id::text AS "fieldId", f.name AS "fieldName", c.name AS "clientName", u.name AS "assignedToName"
       FROM collection_orders co
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       LEFT JOIN users u ON u.id = co.assigned_to
       WHERE co.tenant_id = $1::uuid AND co.status IN ('PLANNED','IN_PROGRESS') AND co.planned_at IS NOT NULL AND co.planned_at < now()`,
      [tenantId],
    );
    for (const row of overdueOrders.rows) {
      alerts.push({
        id: `overdue-order-${row.id}`, category: "Coleta atrasada", criticality: "ALTA",
        title: `${row.code} está atrasada`, description: `${row.clientName} · ${row.fieldName} — planejada para ${new Date(row.plannedAt).toLocaleDateString("pt-BR")}`,
        href: `/coletas?orderId=${row.id}#pontos-coleta`, context: row.fieldName, fieldId: row.fieldId,
        date: row.plannedAt, responsible: row.assignedToName ?? null,
      });
    }

    const pendingPoints = await client.query(
      `SELECT co.id::text, co.code, co.planned_at::text AS "plannedAt", f.id::text AS "fieldId", f.name AS "fieldName", c.name AS "clientName", u.name AS "assignedToName",
              count(sp.*) FILTER (WHERE sp.collected_at IS NULL)::int AS pending, count(sp.*)::int AS total
       FROM collection_orders co
       JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       JOIN sample_points sp ON sp.tenant_id = co.tenant_id AND sp.collection_order_id = co.id
       LEFT JOIN users u ON u.id = co.assigned_to
       WHERE co.tenant_id = $1::uuid AND co.status IN ('PLANNED','IN_PROGRESS')
       GROUP BY co.id, co.code, co.planned_at, f.id, f.name, c.name, u.name HAVING count(sp.*) FILTER (WHERE sp.collected_at IS NULL) > 0`,
      [tenantId],
    );
    for (const row of pendingPoints.rows) {
      alerts.push({
        id: `pending-points-${row.id}`, category: "Pontos não coletados", criticality: row.pending === row.total ? "MEDIA" : "BAIXA",
        title: `${row.pending} de ${row.total} pontos pendentes`, description: `${row.clientName} · ${row.fieldName} — ordem ${row.code}`,
        // Antes era só "/coletas", sem identificar a ordem -- o usuário tinha que procurar manualmente
        // (bug real confirmado na auditoria, item F3). `field-operations-manager.tsx` lê `?orderId=` e
        // pré-seleciona a ordem certa, rolando até ela.
        href: `/coletas?orderId=${row.id}#pontos-coleta`, context: row.fieldName, fieldId: row.fieldId,
        date: row.plannedAt, responsible: row.assignedToName ?? null,
      });
    }

    const awaitingLab = await client.query(
      `SELECT a.id::text, a.code, f.id::text AS "fieldId", f.name AS "fieldName", c.name AS "clientName", a.updated_at::text AS "updatedAt"
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
        href: `/analises/${row.id}`, context: row.fieldName, fieldId: row.fieldId,
        date: row.updatedAt, responsible: null,
      });
    }

    const inconsistent = await client.query(
      `SELECT a.id::text, a.code, f.id::text AS "fieldId", f.name AS "fieldName", c.name AS "clientName", a.updated_at::text AS "updatedAt"
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
        href: `/analises/${row.id}`, context: row.fieldName, fieldId: row.fieldId,
        date: row.updatedAt, responsible: null,
      });
    }

    const awaitingReview = await client.query(
      `SELECT i.id::text, i.analysis_id::text AS "analysisId", i.created_at::text AS "createdAt", a.code, f.id::text AS "fieldId", f.name AS "fieldName", c.name AS "clientName"
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
        href: `/analises/${row.analysisId}`, context: row.fieldName, fieldId: row.fieldId,
        date: row.createdAt, responsible: null,
      });
    }

    // Só alerta sobre culturas que este tenant REALMENTE usa (tem pelo menos uma safra vinculada) --
    // crop_profiles é catálogo global (54+ culturas, de soja a abacateiro), sem tenant_id; sem esse
    // filtro, todo tenant via alerta de homologação pendente de toda cultura do catálogo, mesmo as que
    // nunca vai plantar -- 84 alertas de baixa prioridade que na prática viram ruído, escondendo os que
    // realmente importam pra essa operação.
    const unhomologatedParams = await client.query(
      `SELECT cp.id::text, cp.name, count(*)::int AS pending
       FROM crop_profile_parameters cpp
       JOIN crop_profiles cp ON cp.id = cpp.crop_profile_id
       WHERE cpp.status != 'ACTIVE'
         AND cp.id IN (SELECT DISTINCT crop_profile_id FROM crop_seasons WHERE tenant_id = $1::uuid AND crop_profile_id IS NOT NULL)
       GROUP BY cp.id, cp.name`,
      [tenantId],
    );
    for (const row of unhomologatedParams.rows) {
      alerts.push({
        id: `unhomologated-${row.id}`, category: "Parâmetro sem regra homologada", criticality: "BAIXA",
        title: `${row.pending} parâmetro(s) de ${row.name} aguardando homologação`, description: "Faixas de suficiência ainda não aprovadas por um agrônomo responsável.",
        href: "/biblioteca-tecnica", context: row.name, fieldId: null,
        date: null, responsible: null,
      });
    }

    const seasonsWithoutCrop = await client.query(
      `SELECT cs.id::text, cs.season_label AS "seasonLabel", f.id::text AS "fieldId", f.name AS "fieldName", c.name AS "clientName"
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
        href: "/coletas#safras", context: row.fieldName, fieldId: row.fieldId,
        date: null, responsible: null,
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
        href: "/coletas#safras", context: row.name, fieldId: row.id,
        date: null, responsible: null,
      });
    }

    const staleAnalyses = await client.query(
      `SELECT a.id::text, a.code, a.status, f.id::text AS "fieldId", f.name AS "fieldName", c.name AS "clientName", a.created_at::text AS "createdAt"
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
        href: `/analises/${row.id}`, context: row.fieldName, fieldId: row.fieldId,
        date: row.createdAt, responsible: null,
      });
    }

    const brokenTraceability = await client.query(
      `SELECT ls.id::text, ls.laboratory_code, a.id::text AS "analysisId", a.code AS "analysisCode", f.id::text AS "fieldId", f.name AS "fieldName", c.name AS "clientName"
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
        href: `/analises/${row.analysisId}`, context: row.fieldName, fieldId: row.fieldId,
        date: null, responsible: null,
      });
    }

    /**
     * Reanálise vencida: regra já carregada na base de conhecimento (fonte: Trigo Safra 2026) --
     * análise de solo deve ser refeita a cada 3 anos no máximo. Pedido real do diretor (2026-09-04):
     * manter o produtor "na vida da plataforma", incentivando recoleta periódica em vez de deixar a
     * análise antiga silenciosamente desatualizada.
     */
    const reanalysisDue = await client.query(
      `SELECT f.id::text, f.name, c.name AS "clientName", max(a.created_at)::text AS "lastAnalysisAt"
       FROM analyses a
       JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE a.tenant_id = $1::uuid
       GROUP BY f.id, f.name, c.name
       HAVING max(a.created_at) < now() - interval '3 years'`,
      [tenantId],
    );
    for (const row of reanalysisDue.rows) {
      const years = ((Date.now() - new Date(row.lastAnalysisAt).getTime()) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1);
      alerts.push({
        id: `reanalysis-due-${row.id}`, category: "Reanálise de solo vencida", criticality: "MEDIA",
        title: `${row.name} sem análise há mais de 3 anos`, description: `${row.clientName} — última análise há ${years} anos (regra: reanalisar no máximo a cada 3 anos).`,
        href: `/relatorios/evolucao/${row.id}`, context: row.name, fieldId: row.id,
        date: row.lastAnalysisAt, responsible: null,
      });
    }

    /**
     * Desvio de aplicação de insumo: recomendado (`input_recommendations`) x aplicado
     * (`input_applications`) -- pedido real do diretor (2026-09-04, ideia trazida por Rafael/Cabeda):
     * sinalizar quando o produtor aplicou quantidade muito diferente da recomendada, servindo tanto de
     * alerta de manejo quanto de respaldo técnico do agrônomo quando a produtividade não bate com o
     * esperado. Mesmo limiar de `getInputComparisonForAnalysis` (catalog.ts): <95% ou >110% do
     * recomendado. Só aplica quando HOUVE aplicação registrada -- "não aplicou ainda" não é alertado
     * aqui (pode ser só falta de tempo, não é necessariamente desvio).
     */
    const inputDeviation = await client.query(
      `WITH latest_recommendations AS (
         SELECT DISTINCT ON (analysis_id, input_type) analysis_id, input_type, quantity, unit
         FROM input_recommendations WHERE tenant_id = $1::uuid
         ORDER BY analysis_id, input_type, calculated_at DESC
       ),
       applied_totals AS (
         SELECT analysis_id, input_type, unit, SUM(quantity) AS total_quantity
         FROM input_applications WHERE tenant_id = $1::uuid
         GROUP BY analysis_id, input_type, unit
       )
       SELECT r.analysis_id::text AS "analysisId", r.input_type AS "inputType", r.quantity::float8 AS "recommendedQuantity", r.unit,
              a.total_quantity::float8 AS "appliedQuantity", an.code, f.id::text AS "fieldId", f.name AS "fieldName", c.name AS "clientName"
       FROM latest_recommendations r
       JOIN applied_totals a ON a.analysis_id = r.analysis_id AND a.input_type = r.input_type AND a.unit = r.unit
       JOIN analyses an ON an.tenant_id = $1::uuid AND an.id = r.analysis_id
       JOIN crop_seasons cs ON cs.tenant_id = an.tenant_id AND cs.id = an.crop_season_id
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id`,
      [tenantId],
    );
    for (const row of inputDeviation.rows) {
      const ratio = row.appliedQuantity / row.recommendedQuantity;
      if (ratio >= 0.95 && ratio <= 1.1) continue;
      const over = ratio > 1.1;
      alerts.push({
        id: `input-deviation-${row.analysisId}-${row.inputType}`, category: "Desvio de aplicação de insumo", criticality: over ? "ALTA" : "MEDIA",
        title: `${row.fieldName} — ${row.inputType} ${over ? "acima" : "abaixo"} do recomendado`,
        description: `${row.clientName} · ${row.code} — recomendado ${row.recommendedQuantity}${row.unit}, aplicado ${row.appliedQuantity.toFixed(2)}${row.unit} (${Math.round(ratio * 100)}% do recomendado).`,
        href: `/analises/${row.analysisId}`, context: row.fieldName, fieldId: row.fieldId,
        date: null, responsible: null,
      });
    }

    /**
     * Aviso climático da safra (El Niño 2026/27) -- pedido real do diretor (2026-09-07): não estimar
     * produtividade numérica ligada ao clima (isso seria número inventado, sem modelo calibrado real por
     * trás), mas alertar com recomendação QUALITATIVA de manejo de risco, sourced numa fonte técnica real.
     * Validado depois em DUAS rodadas independentes de pesquisa externa (GPT e Claude com busca na web,
     * 2026-09-07/08) -- as duas confirmaram as fontes, mas trouxeram 3 correções importantes que mudaram
     * o texto abaixo; documentadas aqui pra não se perder.
     *
     * Fonte 1 (prognóstico da safra): NOAA/CPC (≥90% de probabilidade de El Niño no trimestre ago-set-
     * out/2026, persistindo até 1º trim. 2027) via INMET/CPTEC; recomendações técnicas de Jossana Ceolin
     * Cera (Meteorologista, CREA-RS 244228, IRGA), publicadas em "El Niño 2026/27: foi dada a largada!"
     * (Mais Soja/IRGA/Planeta Arroz, 2026).
     *
     * Fonte 2 (existe modelo real ligando clima e produtividade?): DA CUNHA MELLO, F.D.; KUMAR, P.;
     * NASCIMENTO, E.G.S. "Weak and heterogeneous ENSO teleconnections to Brazilian soybean yields: a
     * municipal-to-national assessment", Theoretical and Applied Climatology, v.157, art.322, 2026 (DOI
     * 10.1007/s00704-026-06266-z, acesso aberto) -- 21 safras (2000-2021), 1.733 municípios, 10 estados.
     * Depois de correção de teste múltiplo (Benjamini-Hochberg, q=0,10), NENHUM estado ficou
     * estatisticamente significativo; correlação mediana |r|≈0,17 (R² mediano ≈0,03). CORREÇÃO 1
     * (importante): o RS especificamente aparece como um dos estados de efeito DESPREZÍVEL na comparação
     * El Niño×La Niña (|δ de Cliff|≤0,12) e é o estado de MAIOR variabilidade interanual do país (σ_RS
     * 575,5 kg/ha vs. σ_MT 150,8 kg/ha) sem que o ENOS explique essa variação. Conclusão dos próprios
     * autores: o RÓTULO de fase do ENOS sozinho não é preditor robusto -- o mecanismo real é a CHUVA
     * dentro da estação, da qual o índice oceânico é só um proxy fraco. Por isso o texto abaixo nunca usa
     * "é ano de El Niño" como razão determinística, só como contexto oficial de prognóstico.
     *
     * Fonte 3 (a única cifra numérica real e quantificada, por isso é a única que entra no texto): SOARES,
     * M.F. et al. "Assessing environmental and management factors that drive soybean yield gaps in
     * Brazil", Journal of Environmental Quality, v.54, n.6, p.1383-1396, 2025 (DOI 10.1002/jeq2.70076,
     * PMC12593302, acesso aberto). CORREÇÃO 2 (geografia): a cifra de "até 42 kg/ha/dia de queda de Yp
     * após 30/10" é da MR1 (macrorregião edafoclimática MAPA/ZARC que inclui o RS -- não é "RS+SC+PR"
     * tratados como bloco único; a MR2, que cobre parte de PR/SP/MS, tem a MESMA perda máxima mas a queda
     * só começa na 2ª quinzena de novembro). Nunca generalizar essa data pra outro estado sem checar a
     * macrorregião do IN SPA/MAPA nº 1/2021. CORREÇÃO 3 (natureza do número): "até 42 kg/ha/dia" é
     * DECAIMENTO DE PRODUTIVIDADE POTENCIAL (Yp) SIMULADO (sem limitação hídrica/nutricional), não perda
     * observada em lavoura real -- é um TETO teórico pra ordenar prioridade ("atrasar custa mais no Sul"),
     * nunca uma penalidade a se subtrair do laudo como se fosse precisão de campo. O mesmo artigo confirma
     * que quem sofre queda de produtividade real no Sul é ano de LA NIÑA (por déficit hídrico) -- este ano
     * sendo El Niño, o risco dominante tende a ser o oposto (chuva em excesso/atraso de plantio).
     *
     * Escopo: só dispara pra safra 2026/27, culturas de verão (soja/milho/arroz) em propriedades no RS --
     * é exatamente o recorte da fonte. Isso é conteúdo datado por natureza (uma previsão climática de uma
     * safra específica) -- precisa ser atualizado ou removido quando a safra 2026/27 passar; não
     * generaliza pra safras futuras sozinho.
     */
    const CLIMATE_ADVISORY_CROPS = ["soja", "milho", "arroz"];
    const climateSeasons = await client.query(
      `SELECT cs.id::text, cs.field_id::text AS "fieldId", cs.season_label AS "seasonLabel",
              coalesce(cs.next_crop, cs.current_crop) AS crop, f.name AS "fieldName", c.name AS "clientName"
       FROM crop_seasons cs
       JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
       JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
       JOIN clients c ON c.tenant_id = p.tenant_id AND c.id = p.client_id
       WHERE cs.tenant_id = $1::uuid AND cs.season_label = '2026/27' AND p.state = 'RS'
         AND lower(coalesce(cs.next_crop, cs.current_crop, '')) = ANY($2::text[])`,
      [tenantId, CLIMATE_ADVISORY_CROPS],
    );
    for (const row of climateSeasons.rows) {
      alerts.push({
        id: `climate-el-nino-2026-27-${row.id}`,
        category: "Aviso climático da safra",
        criticality: "MEDIA",
        title: `${row.crop} 2026/27 sob El Niño confirmado (≥90% NOAA/CPC) — atenção à janela de plantio`,
        description: `${row.clientName} · ${row.fieldName} — prognóstico oficial (NOAA/CPC via INMET/CPTEC) indica El Niño confirmado para a safra 2026/27, o que historicamente tende a trazer primavera mais chuvosa no RS — mas um estudo científico recente (da Cunha Mello et al., 2026) mostra que, isoladamente, a fase do El Niño/La Niña é um sinal fraco pro RS especificamente; o que importa de verdade é acompanhar a previsão de chuva local, não só o rótulo do fenômeno. Ainda assim, valem os cuidados já recomendados pela meteorologista do IRGA: janela de semeadura tende a ficar menor, com risco de atraso — evitar semeadura tardia (na macrorregião do RS, cada dia de atraso além de ~30/10 pode custar até 42 kg/ha de teto de produtividade potencial simulada, Soares et al. 2025 — é um teto teórico, não uma perda medida em lavoura). Priorizar drenagem eficiente em áreas baixas e evitar investimento pesado perto de rio (risco de enchente). Mesmo em ano de El Niño, pode haver veranico de 10-15 dias no verão — planejar para esse risco também (queda de produtividade por seca no RS está mais associada a anos de La Niña, não a este). Fontes: NOAA/CPC/INMET/CPTEC; Jossana Ceolin Cera (IRGA, CREA-RS 244228); da Cunha Mello et al. (2026, Theoretical and Applied Climatology); Soares et al. (2025, Journal of Environmental Quality). Não é estimativa de produtividade — é orientação de manejo de risco.`,
        href: `/coletas`, context: row.fieldName, fieldId: row.fieldId,
        date: null, responsible: null,
      });
    }

    const order = { ALTA: 0, MEDIA: 1, BAIXA: 2 };
    return alerts.sort((a, b) => order[a.criticality] - order[b.criticality]);
  });
}
