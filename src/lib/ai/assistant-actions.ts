import type { PoolClient } from "pg";
import { withTenant } from "@/lib/db";
import { parseAssistantAction, resolveActionHref, type AssistantAction, type ResolvedAssistantAction } from "@/lib/ai/assistant-actions-schema";

/**
 * Fase 4, Bloco 4 — validação real (banco) das ações sugeridas pelo Assistente.
 *
 * `AssistantAction -> validateAssistantAction(session, action) -> ResolvedAssistantAction | null`.
 *
 * Nunca `{ href: string_vindo_do_modelo }`: o provider só pode sugerir uma INTENÇÃO tipada
 * (`AssistantAction`); esta função é o ÚNICO lugar que transforma isso num `href` real, e só depois de:
 *  1. formato/allowlist (`parseAssistantAction`, schema fechado, sem banco);
 *  2. role da sessão é uma role real da plataforma (nunca uma sessão corrompida/desconhecida);
 *  3. a(s) entidade(s) referenciada(s) existe(m) E pertence(m) ao TENANT da sessão -- reconsultadas aqui,
 *     nunca confiadas porque "estavam no Evidence Package" (que pode estar desatualizado, ou a ação pode
 *     referenciar algo fora do Evidence Package usado pra gerar a resposta).
 * Qualquer falha em qualquer etapa -> `null` (ação nunca oferecida), nunca um fallback permissivo.
 *
 * Nenhuma ação desta rodada executa alteração de banco -- todas resolvem pra uma URL de NAVEGAÇÃO/FILTRO
 * de uma tela que já existe. A ação só acontece quando o usuário clica no link resolvido; o clique em si
 * passa pelas verificações de RBAC/tenant normais da própria página de destino (segunda camada,
 * redundante de propósito).
 */

export type AssistantActionSession = { tenantId: string; userId: string; role: string };

/** As 6 roles reais da plataforma (`user_role`, `db/migrations/001_initial.sql`). Uma sessão com role fora
 *  disso (corrompida/desconhecida) nunca recebe uma ação resolvida. */
const REAL_ROLES = new Set(["SUPER_ADMIN", "TENANT_ADMIN", "AGRONOMIST", "FIELD_TECH", "COMMERCIAL", "VIEWER"]);

/**
 * Restrição de role por tipo de ação, quando existir. Auditado contra `src/lib/navigation.ts`: as ÚNICAS
 * rotas hoje restritas por role no app são `/biblioteca-tecnica` (SUPER_ADMIN/TENANT_ADMIN/AGRONOMIST),
 * `/configuracoes#equipe` (SUPER_ADMIN/TENANT_ADMIN) e `/financeiro` (SUPER_ADMIN/TENANT_ADMIN/COMMERCIAL)
 * -- nenhuma das 6 ações desta rodada aponta pra essas rotas, então nenhuma tem restrição REAL hoje (mapa,
 * comparativos, análise, talhão, relatórios e inteligência são acessíveis a qualquer role autenticada do
 * tenant). O objeto fica vazio de propósito, mas o mecanismo roda de verdade a cada chamada -- o dia que
 * uma ação apontar pra uma rota role-restrita, a entrada entra aqui, sem mudar a assinatura da função.
 */
const ROLE_RESTRICTIONS: Partial<Record<AssistantAction["kind"], Set<string>>> = {};

function isRoleAllowed(kind: AssistantAction["kind"], role: string): boolean {
  if (!REAL_ROLES.has(role)) return false;
  const restriction = ROLE_RESTRICTIONS[kind];
  if (!restriction) return true;
  return restriction.has(role);
}

async function existsForTenant(client: PoolClient, table: string, tenantId: string, id: string): Promise<boolean> {
  // `table` NUNCA vem de entrada externa -- só dos mapeamentos fixos abaixo (allowlist interna), nunca de
  // `action.mode`/`action.reportType` usados diretamente. Seguro contra injeção pelo mesmo motivo que um
  // `switch` com literais é seguro.
  const result = await client.query(`SELECT 1 FROM ${table} WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`, [tenantId, id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Fase 4E, Bloco 2 -- confere que `id` (em `table`) pertence de verdade a `parentId` (via `parentColumn`),
 * dentro do MESMO tenant. `table`/`parentColumn` nunca vêm de entrada externa -- só dos 3 pares fixos
 * chamados em `verifyOwnership` (mesma lógica de allowlist interna de `existsForTenant`, acima).
 */
async function belongsTo(client: PoolClient, table: string, tenantId: string, id: string, parentColumn: string, parentId: string): Promise<boolean> {
  const result = await client.query(`SELECT 1 FROM ${table} WHERE tenant_id = $1::uuid AND id = $2::uuid AND ${parentColumn} = $3::uuid LIMIT 1`, [tenantId, id, parentId]);
  return (result.rowCount ?? 0) > 0;
}

const COMPARISON_MODE_TABLE: Record<"fields" | "seasons" | "points" | "properties", string> = {
  fields: "fields",
  seasons: "crop_seasons",
  points: "sample_points",
  properties: "properties",
};

async function verifyOwnership(tenantId: string, userId: string, action: AssistantAction): Promise<boolean> {
  return withTenant({ tenantId, userId }, async (client) => {
    switch (action.kind) {
      case "show_on_map":
        return existsForTenant(client, "collection_orders", tenantId, action.collectionOrderId);
      case "open_comparison": {
        const table = COMPARISON_MODE_TABLE[action.mode];
        const [ownsA, ownsB] = await Promise.all([existsForTenant(client, table, tenantId, action.a), existsForTenant(client, table, tenantId, action.b)]);
        return ownsA && ownsB;
      }
      case "open_analysis":
        return existsForTenant(client, "analyses", tenantId, action.analysisId);
      case "open_field":
        return existsForTenant(client, "fields", tenantId, action.fieldId);
      case "open_report": {
        const table = action.reportType === "field" ? "analyses" : "properties";
        return existsForTenant(client, table, tenantId, action.id);
      }
      case "filter_intelligence": {
        const checks: Promise<boolean>[] = [];
        if (action.clientId) checks.push(existsForTenant(client, "clients", tenantId, action.clientId));
        if (action.propertyId) checks.push(existsForTenant(client, "properties", tenantId, action.propertyId));
        if (action.fieldId) checks.push(existsForTenant(client, "fields", tenantId, action.fieldId));
        if (action.seasonId) checks.push(existsForTenant(client, "crop_seasons", tenantId, action.seasonId));
        if (checks.length) {
          const results = await Promise.all(checks);
          if (!results.every(Boolean)) return false; // algum id não existe/não é deste tenant
        }
        // Fase 4E, Bloco 2 -- isolamento de tenant sozinho não captura uma combinação HIERARQUICAMENTE
        // inconsistente dentro do MESMO tenant (ex.: `propertyId` de uma fazenda + `fieldId` de OUTRA
        // fazenda do mesmo tenant -- os dois passam nos checks acima isoladamente). Confere os 3 pares
        // adjacentes só quando AMBOS os lados do par foram informados -- nunca inventa um nível
        // intermediário ausente pra completar a cadeia (ex.: só `clientId`+`fieldId`, sem `propertyId`,
        // não tenta validar a relação entre os dois -- a relação POSSÍVEL de validar aqui é só a
        // adjacente). Qualquer par informado que não bate -> ação rejeitada, nunca "corrigida" silenciosamente.
        const hierarchyChecks: Promise<boolean>[] = [];
        if (action.propertyId && action.clientId) hierarchyChecks.push(belongsTo(client, "properties", tenantId, action.propertyId, "client_id", action.clientId));
        if (action.fieldId && action.propertyId) hierarchyChecks.push(belongsTo(client, "fields", tenantId, action.fieldId, "property_id", action.propertyId));
        if (action.seasonId && action.fieldId) hierarchyChecks.push(belongsTo(client, "crop_seasons", tenantId, action.seasonId, "field_id", action.fieldId));
        if (!hierarchyChecks.length) return true;
        const hierarchyResults = await Promise.all(hierarchyChecks);
        return hierarchyResults.every(Boolean);
      }
    }
  });
}

/**
 * Ponto único de validação. `raw` é o que o provider devolveu em `suggested_actions` (ainda não confiado).
 * Devolve `null` em qualquer falha -- nunca uma ação parcialmente resolvida.
 */
export async function validateAssistantAction(session: AssistantActionSession, raw: unknown): Promise<ResolvedAssistantAction | null> {
  const action = parseAssistantAction(raw);
  if (!action) return null; // kind desconhecido / formato inválido / enum fora do permitido
  if (!isRoleAllowed(action.kind, session.role)) return null;
  const owns = await verifyOwnership(session.tenantId, session.userId, action);
  if (!owns) return null; // entidade não existe OU não pertence a este tenant
  const { label, description, href } = resolveActionHref(action);
  return { kind: action.kind, label, description, href };
}

/** Valida uma lista inteira de ações cruas, descartando (nunca lançando erro para) as que falharem. */
export async function validateAssistantActions(session: AssistantActionSession, rawActions: unknown[]): Promise<ResolvedAssistantAction[]> {
  const resolved = await Promise.all(rawActions.map((raw) => validateAssistantAction(session, raw)));
  return resolved.filter((action): action is ResolvedAssistantAction => action !== null);
}
