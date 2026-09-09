import { withTenant } from "@/lib/db";

/**
 * Teto mensal de prescrições por IA, por empresa cliente -- alavanca de
 * controle de custo por plano vendido. Contagem sempre a partir do início
 * do mês corrente (fuso do servidor); zera sozinha no próximo mês, sem
 * job nenhum, só porque a janela do filtro muda.
 *
 * `ai_generations` tem FORCE ROW LEVEL SECURITY -- precisa de `withTenant`
 * (que define `app.tenant_id` na sessão) para enxergar qualquer linha,
 * mesmo do próprio tenant; `tenants` em si não tem RLS, mas misturar as
 * duas num JOIN/subquery só funciona se a sessão tiver o contexto certo.
 */
export async function getTenantPrescriptionUsage(tenantId: string) {
  return withTenant({ tenantId }, async (client) => {
    const result = await client.query<{ monthlyPrescriptionLimit: number; usedThisMonth: string }>(
      `SELECT t.monthly_prescription_limit AS "monthlyPrescriptionLimit",
              (SELECT count(*) FROM ai_generations g
               WHERE g.tenant_id = t.id AND g.kind = 'AGRONOMIC_PRESCRIPTION'
                 AND g.created_at >= date_trunc('month', now())) AS "usedThisMonth"
       FROM tenants t WHERE t.id = $1::uuid`,
      [tenantId],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Empresa não encontrada.");
    return { monthlyLimit: row.monthlyPrescriptionLimit, usedThisMonth: Number(row.usedThisMonth) };
  });
}

export async function hasReachedMonthlyPrescriptionLimit(tenantId: string): Promise<boolean> {
  const usage = await getTenantPrescriptionUsage(tenantId);
  return usage.usedThisMonth >= usage.monthlyLimit;
}
