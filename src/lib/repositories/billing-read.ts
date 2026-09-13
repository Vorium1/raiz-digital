import { withTenant } from "@/lib/db";

export type TenantSubscription = {
  id: string;
  status: string;
  monthlyAmountCents: number;
  dueDay: number;
  blockedAt: string | null;
  createdAt: string;
};

export type TenantInvoice = {
  id: string;
  provider: string;
  providerChargeId: string | null;
  amountCents: number;
  dueAt: string;
  graceDeadline: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
};

export async function getTenantBillingSnapshot(tenantId: string, userId: string) {
  return withTenant({ tenantId, userId }, async (client) => {
    const [subscriptionResult, invoicesResult] = await Promise.all([
      client.query<TenantSubscription>(
        `SELECT id::text,
                status::text,
                monthly_amount_cents AS "monthlyAmountCents",
                due_day AS "dueDay",
                blocked_at::text AS "blockedAt",
                created_at::text AS "createdAt"
         FROM subscriptions
         WHERE tenant_id = $1::uuid
         LIMIT 1`,
        [tenantId],
      ),
      client.query<TenantInvoice>(
        `SELECT id::text,
                provider,
                provider_charge_id AS "providerChargeId",
                amount_cents AS "amountCents",
                due_at::text AS "dueAt",
                grace_deadline::text AS "graceDeadline",
                status::text,
                paid_at::text AS "paidAt",
                created_at::text AS "createdAt"
         FROM invoices
         WHERE tenant_id = $1::uuid
         ORDER BY due_at DESC, created_at DESC
         LIMIT 24`,
        [tenantId],
      ),
    ]);

    return {
      subscription: subscriptionResult.rows[0] ?? null,
      invoices: invoicesResult.rows,
    };
  });
}
