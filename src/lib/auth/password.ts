import { hash, verify } from "@node-rs/argon2";

const options = {
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export async function hashPassword(password: string) {
  if (password.length < 10) throw new Error("A senha precisa ter ao menos 10 caracteres.");
  return hash(password, options);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password, options);
  } catch {
    return false;
  }
}
