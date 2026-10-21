import { describe, expect, it } from "vitest";

import {
  ABSOLUTE_SESSION_TTL_MS,
  SLIDING_SESSION_TTL_MS,
} from "@/app/_lib/auth/constants";
import { createSession } from "@/app/_lib/auth/session-store";
import { SESSION_COOKIE_NAME, setSessionCookie } from "@/app/_lib/cookies";
import { prisma } from "@/app/_lib/db";
import { getSession } from "@/app/_lib/session";
import {
  currentSessionCookie,
  seedUser,
  type SeedUserOverrides,
} from "@/tests/helpers/auth";
import { testCookieJar } from "@/tests/stubs/next-headers";

const DAY_MS = 24 * 60 * 60 * 1000;

async function signIn(overrides: SeedUserOverrides = {}) {
  const { user } = await seedUser(overrides);
  const sessionId = await createSession(user.id);
  await setSessionCookie(sessionId);

  return { user, sessionId };
}

describe("getSession", () => {
  it("returns null when there is no cookie", async () => {
    await expect(getSession()).resolves.toBeNull();
  });

  it("returns the narrow user for a valid session", async () => {
    const { user } = await signIn();

    await expect(getSession()).resolves.toEqual({
      user: {
        id: user.id,
        email: "ada@example.com",
        name: "Ada Lovelace",
        isAdmin: false,
      },
    });
  });

  it("never exposes the password hash or the suspension flag", async () => {
    await signIn();

    const session = await getSession();

    expect(Object.keys(session!.user).sort()).toEqual([
      "email",
      "id",
      "isAdmin",
      "name",
    ]);
  });

  it("reports an admin as an admin, so F12 can gate on it", async () => {
    await signIn({ isAdmin: true });

    await expect(getSession()).resolves.toMatchObject({
      user: { isAdmin: true },
    });
  });

  it("returns null for a cookie this deployment did not sign", async () => {
    const { user } = await seedUser();
    const sessionId = await createSession(user.id);
    testCookieJar.seed(SESSION_COOKIE_NAME, `${sessionId}.forged-signature`);

    await expect(getSession()).resolves.toBeNull();
  });
});

describe("getSession on an expired session", () => {
  it("returns null and cleans up once the sliding expiry has passed", async () => {
    const { sessionId } = await signIn();
    await prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await expect(getSession()).resolves.toBeNull();

    await expect(
      prisma.session.findUnique({ where: { id: sessionId } }),
    ).resolves.toBeNull();
    expect(currentSessionCookie()).toBeUndefined();
  });

  it("returns null past the absolute cap even with a fresh sliding expiry", async () => {
    const { sessionId } = await signIn();
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        expiresAt: new Date(Date.now() + SLIDING_SESSION_TTL_MS),
        absoluteExpiresAt: new Date(Date.now() - 60_000),
      },
    });

    await expect(getSession()).resolves.toBeNull();
    await expect(
      prisma.session.findUnique({ where: { id: sessionId } }),
    ).resolves.toBeNull();
  });

  it("returns null when the session row is gone", async () => {
    const { sessionId } = await signIn();
    await prisma.session.delete({ where: { id: sessionId } });

    await expect(getSession()).resolves.toBeNull();
    expect(currentSessionCookie()).toBeUndefined();
  });

  it("does not throw when it cannot clear the cookie mid-render", async () => {
    const { sessionId } = await signIn();
    await prisma.session.delete({ where: { id: sessionId } });

    // Server Component render: headers are already committed, so Next.js
    // rejects the write. The row is what matters; the stale cookie just reads
    // as logged-out.
    testCookieJar.writable = false;

    await expect(getSession()).resolves.toBeNull();
  });
});

describe("getSession on a suspended account", () => {
  it("reads as logged-out", async () => {
    const { user } = await signIn();
    await prisma.user.update({
      where: { id: user.id },
      data: { isSuspended: true },
    });

    await expect(getSession()).resolves.toBeNull();
  });

  it("leaves the row for F12 to clear, so reactivating is possible", async () => {
    const { user, sessionId } = await signIn();
    await prisma.user.update({
      where: { id: user.id },
      data: { isSuspended: true },
    });

    await getSession();

    await expect(
      prisma.session.findUnique({ where: { id: sessionId } }),
    ).resolves.not.toBeNull();
  });
});

describe("getSession sliding expiry", () => {
  it("does not write while the session is under a day old", async () => {
    const { sessionId } = await signIn();
    const before = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    await getSession();

    const after = await prisma.session.findUnique({ where: { id: sessionId } });

    expect(after!.expiresAt.getTime()).toBe(before!.expiresAt.getTime());
  });

  it("pushes the expiry forward once more than a day has elapsed", async () => {
    const { sessionId } = await signIn();
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        expiresAt: new Date(Date.now() + SLIDING_SESSION_TTL_MS - 2 * DAY_MS),
      },
    });
    const before = Date.now();

    await getSession();

    const after = await prisma.session.findUnique({ where: { id: sessionId } });

    expect(
      Math.abs(after!.expiresAt.getTime() - (before + SLIDING_SESSION_TTL_MS)),
    ).toBeLessThan(5_000);
  });

  it("never slides past the absolute cap", async () => {
    const { sessionId } = await signIn();
    const cap = new Date(Date.now() + 2 * DAY_MS);
    await prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() + 60_000), absoluteExpiresAt: cap },
    });

    await getSession();

    const after = await prisma.session.findUnique({ where: { id: sessionId } });

    expect(after!.expiresAt.getTime()).toBe(cap.getTime());
    expect(after!.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + ABSOLUTE_SESSION_TTL_MS,
    );
  });
});
