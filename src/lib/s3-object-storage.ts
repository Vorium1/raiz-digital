import { createHash, createHmac } from "node:crypto";

export type S3ObjectStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  sessionToken?: string;
};

type FetchLike = typeof fetch;

type SignedRequest = {
  url: string;
  headers: Record<string, string>;
};

function sha256Hex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectKey(key: string) {
  return key.split("/").filter(Boolean).map(encodeRfc3986).join("/");
}

function amzTimestamp(now: Date) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function normalizedEndpoint(raw: string) {
  const endpoint = new URL(raw);
  if (!/^https?:$/.test(endpoint.protocol)) throw new Error("S3_ENDPOINT precisa usar HTTP ou HTTPS.");
  if (endpoint.search || endpoint.hash) throw new Error("S3_ENDPOINT não pode conter query string ou fragmento.");
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "") || "/";
  return endpoint;
}

export function loadS3ObjectStorageConfig(env: NodeJS.ProcessEnv = process.env): S3ObjectStorageConfig {
  const endpoint = env.S3_ENDPOINT?.trim() ?? "";
  const region = env.S3_REGION?.trim() || "auto";
  const bucket = env.S3_BUCKET?.trim() ?? "";
  const accessKey = env.S3_ACCESS_KEY?.trim() ?? "";
  const secretKey = env.S3_SECRET_KEY?.trim() ?? "";
  const missing = [
    ["S3_ENDPOINT", endpoint],
    ["S3_BUCKET", bucket],
    ["S3_ACCESS_KEY", accessKey],
    ["S3_SECRET_KEY", secretKey],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Object storage S3 incompleto: configure ${missing.join(", ")}.`);
  normalizedEndpoint(endpoint);
  return { endpoint, region, bucket, accessKey, secretKey, sessionToken: env.S3_SESSION_TOKEN?.trim() || undefined };
}

export function buildSignedS3Request(input: {
  method: "GET" | "PUT" | "HEAD";
  key: string;
  body?: Buffer;
  contentType?: string;
  config: S3ObjectStorageConfig;
  now?: Date;
}): SignedRequest {
  const endpoint = normalizedEndpoint(input.config.endpoint);
  const encodedKey = encodeObjectKey(input.key);
  const basePath = endpoint.pathname === "/" ? "" : endpoint.pathname;
  const canonicalUri = `${basePath}/${encodeRfc3986(input.config.bucket)}/${encodedKey}`.replace(/\/{2,}/g, "/");
  endpoint.pathname = canonicalUri;

  const now = input.now ?? new Date();
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(input.body ?? Buffer.alloc(0));

  const signingHeaders: Record<string, string> = {
    host: endpoint.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (input.contentType) signingHeaders["content-type"] = input.contentType;
  if (input.config.sessionToken) signingHeaders["x-amz-security-token"] = input.config.sessionToken;

  const signedHeaderNames = Object.keys(signingHeaders).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${signingHeaders[name].trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [input.method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${input.config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const dateKey = hmac(`AWS4${input.config.secretKey}`, dateStamp);
  const regionKey = hmac(dateKey, input.config.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return {
    url: endpoint.toString(),
    headers: {
      ...(input.contentType ? { "content-type": input.contentType } : {}),
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...(input.config.sessionToken ? { "x-amz-security-token": input.config.sessionToken } : {}),
      authorization: `AWS4-HMAC-SHA256 Credential=${input.config.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

export async function putS3Object(input: {
  key: string;
  body: Buffer;
  contentType?: string;
  config?: S3ObjectStorageConfig;
  fetchImpl?: FetchLike;
}) {
  const config = input.config ?? loadS3ObjectStorageConfig();
  const request = buildSignedS3Request({ method: "PUT", key: input.key, body: input.body, contentType: input.contentType ?? "application/octet-stream", config });
  const response = await (input.fetchImpl ?? fetch)(request.url, { method: "PUT", headers: request.headers, body: new Uint8Array(input.body) });
  if (!response.ok) throw new Error(`Falha ao arquivar arquivo bruto no object storage (HTTP ${response.status}).`);
}

export async function getS3Object(input: { key: string; config?: S3ObjectStorageConfig; fetchImpl?: FetchLike }) {
  const config = input.config ?? loadS3ObjectStorageConfig();
  const request = buildSignedS3Request({ method: "GET", key: input.key, config });
  const response = await (input.fetchImpl ?? fetch)(request.url, { method: "GET", headers: request.headers });
  if (!response.ok) throw new Error(`Falha ao recuperar arquivo bruto do object storage (HTTP ${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}
