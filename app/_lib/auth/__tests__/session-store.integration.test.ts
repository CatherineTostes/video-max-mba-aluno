import { describe, expect, it } from "vitest";

import { prisma } from "@/app/_lib/db";
import { seedUser } from "@/tests/helpers/auth";
import {
  ABSOLUTE_SESSION_TTL_MS,
  SESSION_REFRESH_THRESHOLD_MS,
  SLIDING_SESSION_TTL_MS,
} from "../constants";
import {
  createSession,
  deleteAllSessionsForUser,
  deleteSession,
  readSession,
  refreshSession,
} from "../session-store";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

/** Allows for the handful of milliseconds the round trip costs. */
function expectCloseTo(actual: Date, expected: number, toleranceMs = 5 * SECOND) {
  expect(Math.abs(actual.getTime() - expected)).toBeLessThan(toleranceMs);
}

async function insertSession(
  userId: string,
  overrides: { expiresAt?: Date; absoluteExpiresAt?: Date } = {},
) {
  const now = Date.now();

  return prisma.session.create({
    data: {
      id: `test-session-${Math.random().toString(36).slice(2)}`,
      userId,
      expiresAt: overrides.expiresAt ?? new Date(now + SLIDING_SESSION_TTL_MS),
      absoluteExpiresAt:
        overrides.absoluteExpiresAt ?? new Date(now + ABSOLUTE_SESSION_TTL_MS),
    },
  });
}

describe("createSession", () => {
  it("returns a base64url id and inserts the matching row", async () => {
    const { user } = await seedUser();
    const before = Date.now();

    const id = await createSession(user.id);

    // 32 random bytes, base64url-encoded, no padding.
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const session = await prisma.session.findUnique({ where: { id } });

    expect(session?.userId).toBe(user.id);
    expectCloseTo(session!.expiresAt, before + SLIDING_SESSION_TTL_MS);
    expectCloseTo(
      session!.absoluteExpiresAt,
      before + ABSOLUTE_SESSION_TTL_MS,
    );
  });

  it("issues a different id every time", async () => {
    const { user } = await seedUser();

    const [first, second] = await Promise.all([
      createSession(user.id),
      createSession(user.id),
    ]);

    expect(first).not.toBe(second);
  });

  it("writes through a transaction client when given one", async () => {
    const { user } = await seedUser();

    const id = await prisma.$transaction((tx) => createSession(user.id, tx));

    await expect(
      prisma.session.findUnique({ where: { id } }),
    ).resolves.not.toBeNull();
  });

  it("leaves no session behind when its transaction rolls back", async () => {
    const { user } = await seedUser();

    await expect(
      prisma.$transaction(async (tx) => {
        await createSession(user.id, tx);
        throw new Error("rolled back");
      }),
    ).rejects.toThrow("rolled back");

    await expect(prisma.session.count()).resolves.toBe(0);
  });
});

describe("readSession", () => {
  it("returns the row while it is fresh", async () => {
    const { user } = await seedUser();
    const id = await createSession(user.id);

    await expect(readSession(id)).resolves.toMatchObject({
      id,
      userId: user.id,
    });
  });

  it("returns null for an id that was never issued", async () => {
    await expect(readSession("never-existed")).resolves.toBeNull();
  });

  it("returns null once the sliding expiry has passed", async () => {
    const { user } = await seedUser();
    const session = await insertSession(user.id, {
      expiresAt: new Date(Date.now() - MINUTE),
    });

    await expect(readSession(session.id)).resolves.toBeNull();
  });

  it("returns null past the absolute cap even when the sliding expiry is fresh", async () => {
    const { user } = await seedUser();
    const session = await insertSession(user.id, {
      expiresAt: new Date(Date.now() + SLIDING_SESSION_TTL_MS),
      absoluteExpiresAt: new Date(Date.now() - MINUTE),
    });

    await expect(readSession(session.id)).resolves.toBeNull();
  });

  it("leaves the expired row in place for the caller to deal with", async () => {
    const { user } = await seedUser();
    const session = await insertSession(user.id, {
      expiresAt: new Date(Date.now() - MINUTE),
    });

    await readSession(session.id);

    await expect(
      prisma.session.findUnique({ where: { id: session.id } }),
    ).resolves.not.toBeNull();
  });
});

describe("refreshSession", () => {
  it("does not write while the session is under a day old", async () => {
    const { user } = await seedUser();
    const session = await insertSession(user.id);

    const refreshed = await refreshSession(session);

    expect(refreshed.expiresAt.getTime()).toBe(session.expiresAt.getTime());
  });

  it("slides the expiry forward once more than a day has elapsed", async () => {
    const { user } = await seedUser();
    const session = await insertSession(user.id, {
      // Looks like a session last touched two days ago.
      expiresAt: new Date(Date.now() + SLIDING_SESSION_TTL_MS - 2 * DAY),
    });
    const before = Date.now();

    const refreshed = await refreshSession(session);

    expectCloseTo(refreshed.expiresAt, before + SLIDING_SESSION_TTL_MS);

    const persisted = await prisma.session.findUnique({
      where: { id: session.id },
    });

    expect(persisted!.expiresAt.getTime()).toBe(refreshed.expiresAt.getTime());
  });

  it("never pushes the expiry past the absolute cap", async () => {
    const { user } = await seedUser();
    const cap = new Date(Date.now() + 3 * DAY);
    const session = await insertSession(user.id, {
      expiresAt: new Date(Date.now() + MINUTE),
      absoluteExpiresAt: cap,
    });

    const refreshed = await refreshSession(session);

    expect(refreshed.expiresAt.getTime()).toBe(cap.getTime());
  });

  it("does not write when the cap leaves less than a day of headroom", async () => {
    const { user } = await seedUser();
    const cap = new Date(
      Date.now() + SESSION_REFRESH_THRESHOLD_MS / 2 + MINUTE,
    );
    const session = await insertSession(user.id, {
      expiresAt: new Date(Date.now() + MINUTE),
      absoluteExpiresAt: cap,
    });

    const refreshed = await refreshSession(session);

    expect(refreshed.expiresAt.getTime()).toBe(session.expiresAt.getTime());
  });
});

describe("deleteSession", () => {
  it("removes the row", async () => {
    const { user } = await seedUser();
    const id = await createSession(user.id);

    await deleteSession(id);

    await expect(readSession(id)).resolves.toBeNull();
  });

  it("is a no-op for an id that is already gone", async () => {
    await expect(deleteSession("never-existed")).resolves.toBeUndefined();
  });
});

describe("deleteAllSessionsForUser", () => {
  it("removes every session the user holds", async () => {
    const { user } = await seedUser();
    await Promise.all([
      createSession(user.id),
      createSession(user.id),
      createSession(user.id),
    ]);

    await deleteAllSessionsForUser(user.id);

    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it("leaves other users' sessions alone", async () => {
    const { user } = await seedUser();
    const { user: other } = await seedUser({ email: "grace@example.com" });
    await createSession(user.id);
    const otherSessionId = await createSession(other.id);

    await deleteAllSessionsForUser(user.id);

    await expect(readSession(otherSessionId)).resolves.not.toBeNull();
  });
});

describe("session cascade", () => {
  it("drops a user's sessions when the user row is deleted", async () => {
    const { user } = await seedUser();
    await createSession(user.id);

    await prisma.user.delete({ where: { id: user.id } });

    await expect(prisma.session.count()).resolves.toBe(0);
  });
});
