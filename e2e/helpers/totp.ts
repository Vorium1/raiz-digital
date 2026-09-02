import { createHmac } from "node:crypto";

// Mesma implementação de src/lib/auth/totp.ts, duplicada aqui de propósito: o teste precisa gerar
// códigos de forma independente da implementação testada, senão um bug na implementação real
// passaria despercebido (o teste bateria com o próprio bug).
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

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

export function totpNow(secretBase32: string) {
  return hotp(base32Decode(secretBase32), Math.floor(Date.now() / 1000 / 30));
}

export function totpAtCounter(secretBase32: string, counter: number) {
  return hotp(base32Decode(secretBase32), counter);
}

export function currentTotpCounter() {
  return Math.floor(Date.now() / 1000 / 30);
}
