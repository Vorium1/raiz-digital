export type OperationalIntegrationReadiness = {
  email: boolean;
  rawStorage: boolean;
  mercadoPago: boolean;
  satelliteNdvi: boolean;
  reportStorage: boolean;
};

type EnvLike = Record<string, string | undefined>;

function present(value: string | undefined) {
  return Boolean(value?.trim());
}

export function getOperationalIntegrationReadiness(env: EnvLike): OperationalIntegrationReadiness {
  const email = env.EMAIL_PROVIDER?.trim().toLowerCase() === "resend"
    && present(env.RESEND_API_KEY)
    && present(env.EMAIL_FROM);

  const rawStorage = env.STORAGE_PROVIDER?.trim().toLowerCase() === "s3"
    && present(env.S3_ENDPOINT)
    && present(env.S3_REGION)
    && present(env.S3_BUCKET)
    && present(env.S3_ACCESS_KEY)
    && present(env.S3_SECRET_KEY);

  const mercadoPago = present(env.MERCADO_PAGO_ACCESS_TOKEN)
    && present(env.MERCADO_PAGO_WEBHOOK_SECRET);

  // O provider padrão atual usa Earth Search público + Sentinel-2 L2A/COG.
  // A prontidão de configuração não depende de credenciais Copernicus.
  const satelliteNdvi = true;

  const reportStorage = env.REPORT_STORAGE_PROVIDER?.trim().toLowerCase() === "inline";

  return { email, rawStorage, mercadoPago, satelliteNdvi, reportStorage };
}

export function operationalIntegrationScore(readiness: OperationalIntegrationReadiness) {
  const values = Object.values(readiness);
  return {
    ready: values.filter(Boolean).length,
    total: values.length,
  };
}
