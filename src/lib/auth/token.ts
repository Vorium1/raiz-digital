import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "raiz_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export function createOpaqueSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
