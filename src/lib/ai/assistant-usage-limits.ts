import { withTenant } from "@/lib/db";
import { localIntentAssistantProvider } from "@/lib/ai/providers/local-intent-assistant-provider";

/**
 * Fase 4G, item 6 — controle de custo/uso de provider GENERATIVO, real e server-side, nunca um contador em
 * memória de processo Node/serverless (que zeraria a cada cold start e não seria compartilhado entre
 * instâncias). Reaproveita `ai_generations` (já existe, já é gravado em toda resposta do Assistente,
 * `recordOperationalAssistantGeneration`) -- nenhuma migração, nenhuma tabela nova.
 *
 * Conta só chamadas a um provider GENERATIVO (`provider <> "raiz-local-intent"`) -- o provider local nunca
 * conta contra o limite (é gratuito/determinístico, sempre disponível). Quando o limite é atingido, o
 * router (`assistant-provider-router.ts`) nunca escalona -- o usuário simplesmente recebe a resposta do
 * provider local pra aquela pergunta, sem nenhuma mensagem sobre cota/limite.
 */

export type UsageLimitCheck = { allowed: true } | { allowed: false; reason: string };

const DEFAULT_MAX_PER_USER_PER_DAY = 20;
const DEFAULT_MAX_PER_TENANT_PER_DAY = 200;
const DEFAULT_TIMEOUT_MS = 15_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** `RAIZ_ASSISTANT_GENERATIVE_TIMEOUT_MS` -- tempo máximo que o router espera uma resposta de um provider
 *  generativo antes de desistir e cair no fallback local. */
export function generativeTimeoutMs(): number {
  return envInt("RAIZ_ASSISTANT_GENERATIVE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
}

/** `RAIZ_ASSISTANT_GENERATIVE_MAX_TOKENS` -- opcional, teto de tokens de saída por chamada. `undefined`
 *  quando não configurado (cada provider usa o próprio padrão, ex. `8000` do Gemini). */
export function generativeMaxTokens(): number | undefined {
  const raw = process.env.RAIZ_ASSISTANT_GENERATIVE_MAX_TOKENS;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * `RAIZ_ASSISTANT_MAX_GENERATIVE_CALLS_PER_USER_DAY` / `RAIZ_ASSISTANT_MAX_GENERATIVE_CALLS_PER_TENANT_DAY`
 * -- consulta real em `ai_generations`, contando só o que já aconteceu HOJE (`date_trunc('day', now())`,
 * fuso do banco) pra este usuário/tenant. `withTenant` -- mesma RLS de sempre, nunca um caminho especial.
 */
export async function checkGenerativeUsageLimit(tenantId: string, userId: string): Promise<UsageLimitCheck> {
  const maxPerUser = envInt("RAIZ_ASSISTANT_MAX_GENERATIVE_CALLS_PER_USER_DAY", DEFAULT_MAX_PER_USER_PER_DAY);
  const maxPerTenant = envInt("RAIZ_ASSISTANT_MAX_GENERATIVE_CALLS_PER_TENANT_DAY", DEFAULT_MAX_PER_TENANT_PER_DAY);
  return withTenant({ tenantId, userId }, async (client) => {
    const result = await client.query<{ userCount: string; tenantCount: string }>(
      `SELECT
         count(*) FILTER (WHERE created_by = $2::uuid) AS "userCount",
         count(*) AS "tenantCount"
       FROM ai_generations
       WHERE tenant_id = $1::uuid
         AND kind = 'OPERATIONAL_ASSISTANT'
         AND provider <> $3
         AND created_at >= date_trunc('day', now())`,
      [tenantId, userId, localIntentAssistantProvider.name],
    );
    const row = result.rows[0];
    const userCount = Number(row?.userCount ?? 0);
    const tenantCount = Number(row?.tenantCount ?? 0);
    if (userCount >= maxPerUser) return { allowed: false, reason: `limite diário de perguntas expandidas por usuário atingido (${userCount}/${maxPerUser})` };
    if (tenantCount >= maxPerTenant) return { allowed: false, reason: `limite diário de perguntas expandidas por empresa atingido (${tenantCount}/${maxPerTenant})` };
    return { allowed: true };
  });
}
