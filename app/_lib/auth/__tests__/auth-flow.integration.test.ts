import { describe, expect, it } from "vitest";

import { prisma } from "@/app/_lib/db";
import { getSession } from "@/app/_lib/session";
import {
  clearBrowserCookies,
  currentSessionCookie,
  expectRedirect,
  runExpectingFailure,
  runExpectingRedirect,
} from "@/tests/helpers/auth";
import { login } from "../login";
import { logout } from "../logout";
import { register } from "../register";

/**
 * The whole feature, end to end: register → log out → log back in → log out.
 *
 * The unit and per-action suites each check one seam. This one checks that the
 * seams line up — that the cookie register writes is the one login replaces
 * and logout clears, and that `getSession()` agrees with the database at every
 * step.
 */

const fields = {
  name: "Ada Lovelace",
  email: "Ada@Example.com",
  password: "analytical1",
  passwordConfirmation: "analytical1",
};

const credentials = { email: "ada@example.com", password: "analytical1" };

describe("register → login → logout round trip", () => {
  it("keeps the cookie, the session table, and getSession in agreement", async () => {
    // 1. Register. The user lands authenticated on the library.
    await runExpectingRedirect(register, fields, "/app");

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "ada@example.com" },
    });
    const registrationCookie = currentSessionCookie();

    expect(registrationCookie).toBeDefined();
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);
    await expect(getSession()).resolves.toMatchObject({
      user: { id: user.id, email: "ada@example.com", isAdmin: false },
    });

    // 2. Log out. Cookie gone, row gone, and nobody is signed in.
    await expectRedirect(logout(), "/");

    expect(currentSessionCookie()).toBeUndefined();
    await expect(prisma.session.count()).resolves.toBe(0);
    await expect(getSession()).resolves.toBeNull();

    // 3. Log back in from a fresh browser with the same credentials.
    clearBrowserCookies();
    await runExpectingRedirect(login, credentials, "/app");

    const loginCookie = currentSessionCookie();

    expect(loginCookie).toBeDefined();
    expect(loginCookie).not.toBe(registrationCookie);
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);
    await expect(getSession()).resolves.toMatchObject({
      user: { id: user.id, email: "ada@example.com" },
    });

    // 4. Log out again. Back to the terminal state, and the account survives.
    await expectRedirect(logout(), "/");

    expect(currentSessionCookie()).toBeUndefined();
    await expect(prisma.session.count()).resolves.toBe(0);
    await expect(getSession()).resolves.toBeNull();
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it("will not let the registered address be registered a second time", async () => {
    await runExpectingRedirect(register, fields, "/app");
    await expectRedirect(logout(), "/");

    const errors = await runExpectingFailure(register, fields);

    expect(errors.email).toEqual([
      "An account with this email already exists — try logging in",
    ]);
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it("will not let the registered password work for a different address", async () => {
    await runExpectingRedirect(register, fields, "/app");
    await expectRedirect(logout(), "/");

    const errors = await runExpectingFailure(login, {
      ...credentials,
      email: "grace@example.com",
    });

    expect(errors._form).toEqual(["Invalid email or password"]);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it("blocks login once the account is suspended, and restores it on reactivation", async () => {
    await runExpectingRedirect(register, fields, "/app");
    await expectRedirect(logout(), "/");

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "ada@example.com" },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { isSuspended: true },
    });

    expect((await runExpectingFailure(login, credentials))._form).toEqual([
      "Invalid email or password",
    ]);

    await prisma.user.update({
      where: { id: user.id },
      data: { isSuspended: false },
    });

    await runExpectingRedirect(login, credentials, "/app");
    await expect(getSession()).resolves.toMatchObject({
      user: { id: user.id },
    });
  });
});
