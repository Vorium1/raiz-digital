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

export function getSatelliteNdviReadiness(env: EnvLike) {
  const provider = env.NDVI_SATELLITE_PROVIDER?.trim().toLowerCase() || "earth-search";
  if (provider === "earth-search") {
    return { provider, ready: true, credentialFree: true } as const;
  }
  if (provider === "copernicus") {
    return {
      provider,
      ready: present(env.COPERNICUS_CLIENT_ID) && present(env.COPERNICUS_CLIENT_SECRET),
      credentialFree: false,
    } as const;
  }
  return { provider, ready: false, credentialFree: false } as const;
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

  // Earth Search é o provider público padrão. Copernicus continua disponível somente
  // quando explicitamente selecionado e com as próprias credenciais presentes.
  const satelliteNdvi = getSatelliteNdviReadiness(env).ready;

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
