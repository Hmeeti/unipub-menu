import { hash, verify, type Options } from "@node-rs/argon2";

/** OWASP-recommended argon2id parameters (m=19 MiB, t=2, p=1). `2` is Algorithm.Argon2id (const enum). */
const OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as unknown as Options;

export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string) {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashed: string, password: string) {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** Used when the login does not exist, so timing does not reveal valid logins. */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(await dummyHash, password);
}
