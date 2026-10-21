import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { ABSOLUTE_SESSION_TTL_MS } from "@/app/_lib/auth/constants";

/**
 * The session cookie, defined in exactly one place.
 *
 * The cookie carries an opaque session id plus an HMAC of that id. The id is
 * also re-validated against the `session` table on every read, so the
 * signature is not what makes the session secure — it just lets us reject a
 * tampered value before spending a database round trip on it.
 */

export const SESSION_COOKIE_NAME = "videomax_session";

/**
 * The browser keeps the cookie for the absolute cap, not the sliding window.
 * The `session` row is the authority on expiry; a cookie that outlives its row
 * simply reads as logged-out.
 */
const COOKIE_MAX_AGE_SECONDS = Math.floor(ABSOLUTE_SESSION_TTL_MS / 1000);

const SIGNATURE_SEPARATOR = ".";

function sign(sessionId: string): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters. Copy .env.example to .env.local and fill it in.",
    );
  }

  return createHmac("sha256", secret).update(sessionId).digest("base64url");
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Lax rather than Strict so following a link into the app from an email or
    // another site still arrives authenticated.
    path: "/",
    // Dev runs over plain HTTP, so `Secure` would drop the cookie entirely.
    secure: process.env.NODE_ENV === "production",
  };
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, formatSessionCookieValue(sessionId), {
    ...baseCookieOptions(),
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Removes the session cookie.
 *
 * Returns `false` instead of throwing when the caller is not allowed to write
 * cookies. `getSession()` clears stale cookies opportunistically, and it also
 * runs during Server Component rendering, where headers are already on the
 * wire and Next.js rejects the write. The session row is deleted either way,
 * so the stale cookie is harmless until the next action clears it for real.
 */
export async function clearSessionCookie(): Promise<boolean> {
  try {
    const cookieStore = await cookies();

    cookieStore.set(SESSION_COOKIE_NAME, "", {
      ...baseCookieOptions(),
      maxAge: 0,
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the session id out of the cookie, or `null` when the cookie is absent,
 * malformed, or carries a signature that does not match this deployment's
 * `SESSION_SECRET`.
 */
export async function readSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return raw ? parseSessionCookieValue(raw) : null;
}

/** Exported for tests and for anything that needs the wire format directly. */
export function formatSessionCookieValue(sessionId: string): string {
  return `${sessionId}${SIGNATURE_SEPARATOR}${sign(sessionId)}`;
}

/** Inverse of {@link formatSessionCookieValue}; `null` when unverifiable. */
export function parseSessionCookieValue(value: string): string | null {
  const separatorIndex = value.lastIndexOf(SIGNATURE_SEPARATOR);

  if (separatorIndex <= 0) {
    return null;
  }

  const sessionId = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expected = sign(sessionId);

  // `timingSafeEqual` throws on a length mismatch, so compare lengths first —
  // the length of an HMAC digest is public information anyway.
  if (signature.length !== expected.length) {
    return null;
  }

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ? sessionId
    : null;
}
