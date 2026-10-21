import "server-only";

import { compare, hash } from "bcryptjs";

/**
 * Password hashing.
 *
 * `bcryptjs` is pure JavaScript, so there is no native module to rebuild per
 * platform. Cost 12 is the 2026 default; `user.password_hash` is `varchar(255)`
 * rather than `char(60)` so moving to argon2id later is a code change, not a
 * migration.
 */

const COST_FACTOR = 12;

/**
 * A real bcrypt hash of a passphrase nobody holds.
 *
 * The login path compares against this when the submitted email matches no
 * user, so an unknown address costs the same wall-clock time as a wrong
 * password and cannot be distinguished by timing. It is a baked-in literal
 * rather than a value hashed at import time so module load stays instant.
 */
export const DUMMY_HASH =
  "$2b$12$91PvQ2QicCOAPEu8HDy7wuksVEafMMVj//ITtnQT1mH2vKnHMAZXy";

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, COST_FACTOR);
}

export function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(plain, passwordHash);
}
