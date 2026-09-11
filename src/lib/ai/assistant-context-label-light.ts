import { withTenant } from "@/lib/db";
import { UUID_EXACT, type AssistantScreenContext, type AssistantScreenState } from "@/lib/ai/assistant-screen";

/**
 * Fase 4E, Bloco 1 — caminho LEVE pra resolver só o rótulo contextual do painel do Assistente, sem montar
 * o Evidence Package inteiro (`buildAssistantEvidence`, `assistant-evidence.ts`).
 *
 * Achado real, auditado nesta rodada (contagem de `client.query` nos repositórios por trás de cada
 * builder, ver `docs/RAIZ_2.0_FASE4E_PRE_LLM.md`): `/api/assistant/context` chamava `buildAssistantEvidence`
 * completo só pra extrair um rótulo. Pro contexto `dashboard`, isso rodava `getExecutiveDashboard` +
 * `getPortfolioFieldSummaries` + `listOperationalAlerts` — a última sozinha soma 13 consultas — pra
 * produzir o texto estático "Central de Decisão". Pro contexto `field`, `getFieldOverview` roda 8
 * consultas (safras, ordens, análises, NDVI, histórico de produtividade, qualidade de GPS...) só pra
 * extrair `nome do talhão · nome da propriedade`.
 *
 * Este arquivo resolve CADA rótulo com a consulta MÍNIMA necessária (1 consulta simples, ou 0 pros
 * estáticos), mas preserva EXATAMENTE as mesmas garantias de segurança do caminho pesado:
 * - sempre via `withTenant` (mesma RLS, nunca um caminho alternativo/mais permissivo);
 * - entidade inexistente ou de outro tenant → `null` (o painel mostra "Contexto indisponível", igual ao
 *   caminho pesado via `deriveContextLabel`);
 * - nunca aceita um id que não bata o formato de uuid direto numa consulta com `::uuid` (mesmo cuidado do
 *   pré-ajuste 2 da Fase 4 e de `resolveFieldIdForCollectionOrder` em `assistant-evidence.ts`);
 * - o texto de cada rótulo é IDÊNTICO ao que `deriveContextLabel`/`assistant-evidence.ts` já produziam —
 *   mesma fonte de dado (mesma coluna, mesmo texto), só sem o resto do pacote de evidência que a resposta
 *   completa (`/api/assistant`) de fato precisa e este endpoint não usa.
 *
 * Nenhuma regra de autorização nova é criada aqui — as mesmas checagens `WHERE tenant_id = $1::uuid`
 * (RLS + filtro explícito, redundantes de propósito) já usadas em todo o resto da base.
 */

const COMPARISON_TABLE: Record<"fields" | "seasons" | "points" | "properties", string> = {
  fields: "fields",
  seasons: "crop_seasons",
  points: "sample_points",
  properties: "properties",
};

export async function resolveContextLabelLight(
  tenantId: string,
  userId: string,
  screenContext: AssistantScreenContext,
  screenState: AssistantScreenState | undefined,
): Promise<string | null> {
  switch (screenContext.type) {
    case "dashboard":
      return "Central de Decisão";
    case "intelligence":
      return "Inteligência Agronômica";

    case "property":
    case "report-property": {
      return withTenant({ tenantId, userId }, async (client) => {
        const result = await client.query(`SELECT name FROM properties WHERE tenant_id = $1::uuid AND id = $2::uuid`, [tenantId, screenContext.id]);
        return result.rows[0]?.name ?? null;
      });
    }

    case "field": {
      return withTenant({ tenantId, userId }, async (client) => {
        const result = await client.query(
          `SELECT f.name AS "fieldName", p.name AS "propertyName" FROM fields f
           JOIN properties p ON p.tenant_id = f.tenant_id AND p.id = f.property_id
           WHERE f.tenant_id = $1::uuid AND f.id = $2::uuid`,
          [tenantId, screenContext.id],
        );
        const row = result.rows[0];
        return row ? `${row.fieldName} · ${row.propertyName}` : null;
      });
    }

    case "analysis": {
      return withTenant({ tenantId, userId }, async (client) => {
        const result = await client.query(`SELECT code FROM analyses WHERE tenant_id = $1::uuid AND id = $2::uuid`, [tenantId, screenContext.id]);
        const code = result.rows[0]?.code;
        return code ? `Análise ${code}` : null;
      });
    }

    case "report-field": {
      return withTenant({ tenantId, userId }, async (client) => {
        const result = await client.query(
          `SELECT f.name AS "fieldName" FROM analyses a
           JOIN crop_seasons cs ON cs.tenant_id = a.tenant_id AND cs.id = a.crop_season_id
           JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
           WHERE a.tenant_id = $1::uuid AND a.id = $2::uuid`,
          [tenantId, screenContext.id],
        );
        const fieldName = result.rows[0]?.fieldName;
        return fieldName ? `Relatório · ${fieldName}` : null;
      });
    }

    case "map": {
      const s = screenState?.screen === "map" ? screenState : undefined;
      // Mesmo cuidado de `resolveFieldIdForCollectionOrder` (assistant-evidence.ts): `collectionOrderId`
      // vem do `ScreenState`, nunca pré-validado como uuid em outro ponto -- checa o formato ANTES de
      // qualquer `::uuid`, nunca deixa um valor malformado chegar no banco.
      if (!s?.collectionOrderId || !UUID_EXACT.test(s.collectionOrderId)) return "Mapa";
      return withTenant({ tenantId, userId }, async (client) => {
        const result = await client.query(
          `SELECT f.name AS "fieldName" FROM collection_orders co
           JOIN crop_seasons cs ON cs.tenant_id = co.tenant_id AND cs.id = co.crop_season_id
           JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
           WHERE co.tenant_id = $1::uuid AND co.id = $2::uuid`,
          [tenantId, s.collectionOrderId],
        );
        const fieldName = result.rows[0]?.fieldName;
        // Ordem informada mas que não resolveu (inexistente/outro tenant) -- mesmo comportamento do
        // caminho pesado (`deriveContextLabel`, `delegatedTo === "unavailable"`): nunca um rótulo
        // inventado, mas também nunca "Contexto indisponível" aqui -- "Mapa" genérico é honesto (o mapa
        // em si é um contexto válido, só a seleção específica não resolveu).
        return fieldName ? `Mapa · ${fieldName}` : "Mapa";
      });
    }

    case "comparison": {
      const s = screenState?.screen === "comparison" ? screenState : undefined;
      if (!s?.a || !s?.b || !s?.mode || !UUID_EXACT.test(s.a) || !UUID_EXACT.test(s.b)) return "Comparativos";
      const table = COMPARISON_TABLE[s.mode];
      return withTenant({ tenantId, userId }, async (client) => {
        if (s.mode === "seasons") {
          const result = await client.query(
            `SELECT cs.id::text, cs.season_label AS label, f.name AS "fieldName" FROM crop_seasons cs
             JOIN fields f ON f.tenant_id = cs.tenant_id AND f.id = cs.field_id
             WHERE cs.tenant_id = $1::uuid AND cs.id = ANY($2::uuid[])`,
            [tenantId, [s.a, s.b]],
          );
          const rowA = result.rows.find((r: { id: string }) => r.id === s.a);
          const rowB = result.rows.find((r: { id: string }) => r.id === s.b);
          if (!rowA || !rowB) return "Comparativos";
          return `Comparativo · ${rowA.fieldName} · ${rowA.label} × ${rowB.fieldName} · ${rowB.label}`;
        }
        const nameColumn = s.mode === "points" ? "code" : "name";
        const result = await client.query(`SELECT id::text, ${nameColumn} AS label FROM ${table} WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`, [tenantId, [s.a, s.b]]);
        const rowA = result.rows.find((r: { id: string }) => r.id === s.a);
        const rowB = result.rows.find((r: { id: string }) => r.id === s.b);
        if (!rowA || !rowB) return "Comparativos";
        return `Comparativo · ${rowA.label} × ${rowB.label}`;
      });
    }
  }
}
