import "server-only";

import { randomBytes } from "node:crypto";

import {
  ABSOLUTE_SESSION_TTL_MS,
  SESSION_REFRESH_THRESHOLD_MS,
  SLIDING_SESSION_TTL_MS,
} from "@/app/_lib/auth/constants";
import { prisma } from "@/app/_lib/db";
import type { Session } from "@/prisma/generated/client/client";

/**
 * CRUD over the `session` table.
 *
 * Sessions are opaque server-side rows rather than JWTs so that revoking one
 * — or all of a user's, which is what F12's "suspend this account" needs — is
 * a single DELETE instead of a token denylist.
 */

/** Accepts either the client or an interactive-transaction client. */
type SessionDb = { session: typeof prisma.session };

const SESSION_ID_BYTES = 32;

function newSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString("base64url");
}

/**
 * Issues a session for `userId` and returns its id — the value that goes into
 * the cookie.
 */
export async function createSession(
  userId: string,
  db: SessionDb = prisma,
): Promise<string> {
  const now = Date.now();
  const id = newSessionId();

  await db.session.create({
    data: {
      id,
      userId,
      expiresAt: new Date(now + SLIDING_SESSION_TTL_MS),
      absoluteExpiresAt: new Date(now + ABSOLUTE_SESSION_TTL_MS),
    },
  });

  return id;
}

/**
 * Returns the session row, or `null` when it does not exist or either expiry
 * has passed. Expired rows are left in place; the caller decides whether to
 * clean them up.
 */
export async function readSession(id: string): Promise<Session | null> {
  const session = await prisma.session.findUnique({ where: { id } });

  if (!session) {
    return null;
  }

  const now = Date.now();

  if (
    session.expiresAt.getTime() <= now ||
    session.absoluteExpiresAt.getTime() <= now
  ) {
    return null;
  }

  return session;
}

/**
 * Slides `expires_at` forward, capped at `absolute_expires_at`.
 *
 * No-ops while the session is still within a day of its last refresh, so a
 * burst of requests costs one write per day rather than one per request.
 * Returns the row as it now stands.
 */
export async function refreshSession(session: Session): Promise<Session> {
  const now = Date.now();
  const nextExpiry = Math.min(
    now + SLIDING_SESSION_TTL_MS,
    session.absoluteExpiresAt.getTime(),
  );

  if (nextExpiry - session.expiresAt.getTime() < SESSION_REFRESH_THRESHOLD_MS) {
    return session;
  }

  return prisma.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(nextExpiry) },
  });
}

/** Removes one session. Safe to call when the row is already gone. */
export async function deleteSession(id: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id } });
}

/**
 * Removes every session a user holds — the "log out everywhere" primitive
 * behind F12's suspend and delete actions.
 */
export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
