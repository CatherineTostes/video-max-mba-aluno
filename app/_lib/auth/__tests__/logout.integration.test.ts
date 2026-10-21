import { describe, expect, it } from "vitest";

import { setSessionCookie } from "@/app/_lib/cookies";
import { prisma } from "@/app/_lib/db";
import { getSession } from "@/app/_lib/session";
import {
  currentSessionCookie,
  expectRedirect,
  seedUser,
} from "@/tests/helpers/auth";
import { createSession } from "../session-store";
import { logout } from "../logout";

async function signIn() {
  const { user } = await seedUser();
  const sessionId = await createSession(user.id);
  await setSessionCookie(sessionId);

  return { user, sessionId };
}

describe("logout", () => {
  it("deletes the session, clears the cookie, and returns to the landing page", async () => {
    const { sessionId } = await signIn();

    await expectRedirect(logout(), "/");

    await expect(
      prisma.session.findUnique({ where: { id: sessionId } }),
    ).resolves.toBeNull();
    expect(currentSessionCookie()).toBeUndefined();
  });

  it("leaves the caller unauthenticated afterwards", async () => {
    await signIn();

    await expectRedirect(logout(), "/");

    await expect(getSession()).resolves.toBeNull();
  });

  it("leaves the user's other sessions alone", async () => {
    const { user } = await seedUser();
    const otherDevice = await createSession(user.id);
    const thisDevice = await createSession(user.id);
    await setSessionCookie(thisDevice);

    await expectRedirect(logout(), "/");

    await expect(
      prisma.session.findUnique({ where: { id: otherDevice } }),
    ).resolves.not.toBeNull();
  });

  it("still redirects when there was no session cookie at all", async () => {
    await expectRedirect(logout(), "/");

    expect(currentSessionCookie()).toBeUndefined();
  });

  it("still redirects when the cookie points at a session already deleted", async () => {
    const { sessionId } = await signIn();
    await prisma.session.delete({ where: { id: sessionId } });

    await expectRedirect(logout(), "/");

    expect(currentSessionCookie()).toBeUndefined();
  });

  it("is safe to call twice", async () => {
    await signIn();

    await expectRedirect(logout(), "/");
    await expectRedirect(logout(), "/");

    await expect(prisma.session.count()).resolves.toBe(0);
  });
});
