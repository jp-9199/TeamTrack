import * as argon2 from '@node-rs/argon2';

/**
 * Pre-computed, static, valid Argon2id hash used to perform dummy password verification
 * when an account does not exist. This eliminates user enumeration via timing discrepancies.
 * Generated with Argon2id parameters (m=19456, t=2, p=1).
 */
export const STATIC_DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$Z3VpJA1w7teGR8Umwi5tUw$kVsVDbssLPV4lKbykt+D4NEbKK7qA568IkguGiv+Tns';

/**
 * Argon2id configuration options for production-grade password hashing.
 * 19 MiB memory, 2 iterations, 1 thread parallelism.
 */
export const ARGON2_OPTIONS: argon2.Options = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
  algorithm: argon2.Algorithm.Argon2id,
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    // Malformed or corrupted hash format
    return false;
  }
}

export async function verifyDummyPassword(password: string): Promise<boolean> {
  try {
    await argon2.verify(STATIC_DUMMY_ARGON2_HASH, password);
  } catch {
    // Ignore any error
  }
  return false;
}
