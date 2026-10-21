import "server-only";

import { readSession, refreshSession } from "@/app/_lib/auth/session-store";
import { clearSessionCookie, readSessionCookie } from "@/app/_lib/cookies";
import { prisma } from "@/app/_lib/db";

/**
 * Session read helper — the single answer to "who is making this request?".
 *
 * Every authenticated route goes through here rather than touching the cookie
 * or the `session` table itself, so authorization decisions all read the same
 * narrow, already-validated user.
 *
 * `cacheComponents` is enabled in `next.config.ts`, which makes the `cookies()`
 * read inside this function request-time only: callers must sit behind a
 * `<Suspense>` boundary (see `app/_components/SessionRedirect.tsx`) or inside a
 * `'use cache: private'` scope.
 */

/** What the rest of the app is allowed to know about the current user. */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

export type Session = {
  user: SessionUser;
};

export async function getSession(): Promise<Session | null> {
  const sessionId = await readSessionCookie();

  if (!sessionId) {
    return null;
  }

  const session = await readSession(sessionId);

  if (!session) {
    // The cookie is correctly signed but the row is gone or past one of its
    // expiries. Drop both so the browser stops presenting a dead credential.
    await deleteStaleSession(sessionId);
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      isSuspended: true,
    },
  });

  if (!user) {
    await deleteStaleSession(sessionId);
    return null;
  }

  // A suspended account reads as logged-out everywhere. F12 additionally
  // deletes the rows when an admin flips the flag; this guard is what makes a
  // suspension take effect even on a session that is already open.
  if (user.isSuspended) {
    return null;
  }

  await refreshSession(session);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
    },
  };
}

async function deleteStaleSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
  await clearSessionCookie();
}
