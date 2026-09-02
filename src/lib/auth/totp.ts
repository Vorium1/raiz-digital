import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_WINDOW = 1;

function base32Encode(buffer: Buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  const remainder = bits.length % 5;
  if (remainder) output += BASE32_ALPHABET[parseInt(bits.slice(-remainder).padEnd(5, "0"), 2)];
  return output;
}

function base32Decode(value: string) {
  const clean = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpAuthUri(input: { secret: string; accountLabel: string; issuer?: string }) {
  const issuer = input.issuer ?? "RAIZ Digital";
  const label = `${issuer}:${input.accountLabel}`;
  const params = new URLSearchParams({ secret: input.secret, issuer, algorithm: "SHA1", digits: "6", period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export function verifyTotpCode(secretBase32: string, code: string) {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;
  const secret = base32Decode(secretBase32);
  const currentCounter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    if (hotp(secret, currentCounter + offset) === trimmed) return true;
  }
  return false;
}

export function generateBackupCodes(count = 10) {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const value = String(randomInt(0, 100_000_000)).padStart(8, "0");
    codes.push(`${value.slice(0, 4)}-${value.slice(4)}`);
  }
  return codes;
}

export function hashBackupCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}
