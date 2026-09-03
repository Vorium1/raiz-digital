import { query } from "@/lib/db";

export type TenantBranding = {
  displayName: string;
  logoDataUrl: string | null;
  responsibleName: string | null;
  responsibleRegistration: string | null;
};

export async function getTenantBranding(tenantId: string): Promise<TenantBranding> {
  const result = await query<{
    tradeName: string;
    reportLogoDataUrl: string | null;
    reportResponsibleName: string | null;
    reportResponsibleRegistration: string | null;
  }>(
    `SELECT trade_name AS "tradeName", report_logo_data_url AS "reportLogoDataUrl",
            report_responsible_name AS "reportResponsibleName",
            report_responsible_registration AS "reportResponsibleRegistration"
     FROM tenants WHERE id = $1::uuid`,
    [tenantId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Empresa não encontrada.");
  return {
    displayName: row.tradeName,
    logoDataUrl: row.reportLogoDataUrl,
    responsibleName: row.reportResponsibleName,
    responsibleRegistration: row.reportResponsibleRegistration,
  };
}

const MAX_LOGO_BYTES = 220_000;

/**
 * Cada campo só é alterado quando explicitamente presente no input (`undefined` = não mexe).
 * `null` explícito limpa o campo (ex.: remover o logo e voltar ao padrão RAIZ Digital).
 */
export async function updateTenantBranding(
  tenantId: string,
  input: { logoDataUrl?: string | null; responsibleName?: string | null; responsibleRegistration?: string | null },
): Promise<TenantBranding> {
  if (input.logoDataUrl) {
    if (!/^data:image\/(png|jpeg|jpg|svg\+xml|webp);base64,/.test(input.logoDataUrl)) {
      throw new Error("Formato de imagem inválido. Envie PNG, JPG, WEBP ou SVG.");
    }
    if (input.logoDataUrl.length > MAX_LOGO_BYTES) {
      throw new Error("Logo muito grande. Envie um arquivo de até 150 KB.");
    }
  }

  const sets: string[] = [];
  const values: unknown[] = [tenantId];
  function set(column: string, value: unknown) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  if (input.logoDataUrl !== undefined) set("report_logo_data_url", input.logoDataUrl);
  if (input.responsibleName !== undefined) set("report_responsible_name", input.responsibleName);
  if (input.responsibleRegistration !== undefined) set("report_responsible_registration", input.responsibleRegistration);

  if (sets.length) {
    await query(`UPDATE tenants SET ${sets.join(", ")} WHERE id = $1::uuid`, values);
  }
  return getTenantBranding(tenantId);
}
