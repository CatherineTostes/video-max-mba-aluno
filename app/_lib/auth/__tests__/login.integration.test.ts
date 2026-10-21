import { describe, expect, it, vi } from "vitest";

import { prisma } from "@/app/_lib/db";
import * as passwordModule from "@/app/_lib/password";
import { getSession } from "@/app/_lib/session";
import { initialAuthFormState } from "@/app/_lib/auth/form-state";
import {
  currentSessionCookie,
  formData,
  runExpectingFailure,
  runExpectingRedirect,
  seedUser,
} from "@/tests/helpers/auth";
import { login } from "../login";

const GENERIC_ERROR = ["Invalid email or password"];

const credentials = { email: "ada@example.com", password: "analytical1" };

describe("login", () => {
  it("opens a session and redirects to the library", async () => {
    const { user } = await seedUser();

    await runExpectingRedirect(login, credentials, "/app");

    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);
    expect(currentSessionCookie()).toBeDefined();
  });

  it("leaves the caller authenticated as that user", async () => {
    await seedUser();

    await runExpectingRedirect(login, credentials, "/app");

    await expect(getSession()).resolves.toMatchObject({
      user: { email: "ada@example.com", isAdmin: false },
    });
  });

  it("accepts the address in any casing", async () => {
    await seedUser({ email: "ada@example.com" });

    await runExpectingRedirect(
      login,
      { ...credentials, email: "ADA@Example.com" },
      "/app",
    );
  });

  it("issues a fresh session rather than reusing the one in the cookie", async () => {
    const { user } = await seedUser();

    await runExpectingRedirect(login, credentials, "/app");
    const first = currentSessionCookie();

    await runExpectingRedirect(login, credentials, "/app");
    const second = currentSessionCookie();

    expect(second).not.toBe(first);
    // Other devices stay logged in; this release has no "log out everywhere".
    await expect(
      prisma.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(2);
  });
});

describe("login failures", () => {
  it("gives the same message for an address with no account", async () => {
    const errors = await runExpectingFailure(login, credentials);

    expect(errors._form).toEqual(GENERIC_ERROR);
    await expect(prisma.session.count()).resolves.toBe(0);
    expect(currentSessionCookie()).toBeUndefined();
  });

  it("gives the same message for a wrong password", async () => {
    await seedUser();

    const errors = await runExpectingFailure(login, {
      ...credentials,
      password: "analytical2",
    });

    expect(errors._form).toEqual(GENERIC_ERROR);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it("gives the same message to a suspended account, even with the right password", async () => {
    await seedUser({ isSuspended: true });

    const errors = await runExpectingFailure(login, credentials);

    expect(errors._form).toEqual(GENERIC_ERROR);
    await expect(prisma.session.count()).resolves.toBe(0);
  });

  it("gives the same message for missing fields, with nothing per-field", async () => {
    const errors = await runExpectingFailure(login, { email: "" });

    expect(errors).toEqual({ _form: GENERIC_ERROR });
    expect(errors.email).toBeUndefined();
    expect(errors.password).toBeUndefined();
  });

  it("echoes the email back, but never the password", async () => {
    await seedUser();

    const state = await login(
      initialAuthFormState,
      formData({ email: "ada@example.com", password: "wrong-password9" }),
    );

    expect(state.values).toEqual({ email: "ada@example.com" });
    expect(JSON.stringify(state)).not.toContain("wrong-password9");
  });

  it("spends a bcrypt comparison even when no such user exists", async () => {
    const verify = vi.spyOn(passwordModule, "verifyPassword");

    try {
      await runExpectingFailure(login, credentials);

      // Without this, an unknown address would answer far faster than a wrong
      // password and the form would leak which addresses are registered.
      expect(verify).toHaveBeenCalledOnce();
      expect(verify.mock.calls[0]![1]).toBe(passwordModule.DUMMY_HASH);
    } finally {
      verify.mockRestore();
    }
  });

  it("answers an unknown address in about the time a wrong password takes", async () => {
    await seedUser({ email: "grace@example.com" });

    const timeOf = async (email: string) => {
      const started = performance.now();
      await runExpectingFailure(login, { email, password: "wrong-password1" });
      return performance.now() - started;
    };

    await timeOf("grace@example.com");

    const wrongPasswordMs = await timeOf("grace@example.com");
    const unknownEmailMs = await timeOf("nobody@example.com");

    expect(
      Math.abs(unknownEmailMs - wrongPasswordMs) / wrongPasswordMs,
    ).toBeLessThan(0.5);
  });
});
