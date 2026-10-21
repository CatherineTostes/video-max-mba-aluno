import { describe, expect, it, vi } from "vitest";

import { prisma } from "@/app/_lib/db";
import { getSession } from "@/app/_lib/session";
import { initialAuthFormState } from "@/app/_lib/auth/form-state";
import {
  currentSessionCookie,
  formData,
  runExpectingFailure,
  runExpectingRedirect,
  seedUser,
} from "@/tests/helpers/auth";
import { register } from "../register";

const DUPLICATE_EMAIL_MESSAGE =
  "An account with this email already exists — try logging in";

const validFields = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "analytical1",
  passwordConfirmation: "analytical1",
};

function withPassword(password: string) {
  return { ...validFields, password, passwordConfirmation: password };
}

describe("register", () => {
  it("creates the user, opens a session, and redirects to the library", async () => {
    await runExpectingRedirect(register, validFields, "/app");

    const user = await prisma.user.findUnique({
      where: { email: "ada@example.com" },
    });

    expect(user).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      isAdmin: false,
      isSuspended: false,
    });

    await expect(
      prisma.session.count({ where: { userId: user!.id } }),
    ).resolves.toBe(1);
    expect(currentSessionCookie()).toBeDefined();
  });

  it("signs the new user straight in — there is no verification step", async () => {
    await runExpectingRedirect(register, validFields, "/app");

    const session = await getSession();

    expect(session?.user.email).toBe("ada@example.com");
    expect(session?.user.name).toBe("Ada Lovelace");
    expect(session?.user.isAdmin).toBe(false);
  });

  it("stores a bcrypt hash, never the submitted password", async () => {
    await runExpectingRedirect(register, validFields, "/app");

    const user = await prisma.user.findUnique({
      where: { email: "ada@example.com" },
    });

    expect(user!.passwordHash).not.toBe("analytical1");
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("trims the name and lowercases the email before storing them", async () => {
    await runExpectingRedirect(
      register,
      { ...validFields, name: "  Ada Lovelace  ", email: "Ada@Example.COM" },
      "/app",
    );

    const user = await prisma.user.findFirst();

    expect(user).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
  });
});

describe("register validation", () => {
  it("rejects a password shorter than 8 characters", async () => {
    const errors = await runExpectingFailure(register, withPassword("abc1"));

    expect(errors.password).toEqual([
      "Password must be at least 8 characters",
    ]);
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it("rejects a password with no letter", async () => {
    const errors = await runExpectingFailure(
      register,
      withPassword("12345678"),
    );

    expect(errors.password).toEqual([
      "Password must contain at least one letter",
    ]);
  });

  it("rejects a password with no number", async () => {
    const errors = await runExpectingFailure(
      register,
      withPassword("abcdefgh"),
    );

    expect(errors.password).toEqual([
      "Password must contain at least one number",
    ]);
  });

  it("rejects a mismatched confirmation, under the confirmation field", async () => {
    const errors = await runExpectingFailure(register, {
      ...validFields,
      passwordConfirmation: "analytical2",
    });

    expect(errors.passwordConfirmation).toEqual(["Passwords do not match"]);
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it("rejects an empty name", async () => {
    const errors = await runExpectingFailure(register, {
      ...validFields,
      name: "   ",
    });

    expect(errors.name).toEqual(["Name is required"]);
  });

  it("rejects a malformed email", async () => {
    const errors = await runExpectingFailure(register, {
      ...validFields,
      email: "not-an-email",
    });

    expect(errors.email).toEqual(["Enter a valid email address"]);
  });

  it("echoes name and email back, but never a password", async () => {
    const state = await register(
      initialAuthFormState,
      formData({ ...validFields, password: "abc1", passwordConfirmation: "abc1" }),
    );

    expect(state.values).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(JSON.stringify(state)).not.toContain("abc1");
  });

  it("leaves no session cookie behind on a rejected registration", async () => {
    await runExpectingFailure(register, withPassword("abc1"));

    expect(currentSessionCookie()).toBeUndefined();
    await expect(prisma.session.count()).resolves.toBe(0);
  });
});

describe("register with a taken email", () => {
  it("points the user at logging in instead", async () => {
    await seedUser({ email: "ada@example.com" });

    const errors = await runExpectingFailure(register, validFields);

    expect(errors.email).toEqual([DUPLICATE_EMAIL_MESSAGE]);
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it("matches regardless of the casing the address was typed in", async () => {
    await seedUser({ email: "A@X.com" });

    const errors = await runExpectingFailure(register, {
      ...validFields,
      email: "a@x.com",
    });

    expect(errors.email).toEqual([DUPLICATE_EMAIL_MESSAGE]);
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it("falls back to the unique index when two registrations race", async () => {
    await seedUser({ email: "ada@example.com" });

    // The application-level check cannot see a row inserted between its own
    // SELECT and the INSERT that follows. Force that blind spot so the unique
    // index is what has to catch the duplicate.
    const findUnique = vi
      .spyOn(prisma.user, "findUnique")
      .mockResolvedValueOnce(null);

    try {
      const errors = await runExpectingFailure(register, validFields);

      expect(errors.email).toEqual([DUPLICATE_EMAIL_MESSAGE]);
      await expect(prisma.user.count()).resolves.toBe(1);
    } finally {
      findUnique.mockRestore();
    }
  });
});
