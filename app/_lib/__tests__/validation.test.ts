import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  FORM_ERROR_KEY,
  formatZodErrors,
  loginSchema,
  registerSchema,
} from "../validation";

const validRegistration = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "analytical1",
  passwordConfirmation: "analytical1",
};

function registerErrors(input: Record<string, unknown>) {
  const result = registerSchema.safeParse(input);

  expect(result.success).toBe(false);

  return formatZodErrors(result.error!);
}

describe("registerSchema", () => {
  it("accepts a valid payload", () => {
    const result = registerSchema.safeParse(validRegistration);

    expect(result.success).toBe(true);
  });

  it("trims the name and lowercases the email", () => {
    const result = registerSchema.parse({
      ...validRegistration,
      name: "  Ada Lovelace  ",
      email: "Ada@Example.COM",
    });

    expect(result.name).toBe("Ada Lovelace");
    expect(result.email).toBe("ada@example.com");
  });

  it("rejects an empty name", () => {
    expect(registerErrors({ ...validRegistration, name: "   " }).name).toEqual([
      "Name is required",
    ]);
  });

  it("rejects a name over 120 characters", () => {
    expect(
      registerErrors({ ...validRegistration, name: "a".repeat(121) }).name,
    ).toEqual(["Name must be at most 120 characters"]);
  });

  it("rejects a malformed email", () => {
    expect(
      registerErrors({ ...validRegistration, email: "not-an-email" }).email,
    ).toEqual(["Enter a valid email address"]);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(
      registerErrors({
        ...validRegistration,
        password: "abc1",
        passwordConfirmation: "abc1",
      }).password,
    ).toEqual(["Password must be at least 8 characters"]);
  });

  it("rejects a password with no letter", () => {
    expect(
      registerErrors({
        ...validRegistration,
        password: "12345678",
        passwordConfirmation: "12345678",
      }).password,
    ).toEqual(["Password must contain at least one letter"]);
  });

  it("rejects a password with no number", () => {
    expect(
      registerErrors({
        ...validRegistration,
        password: "abcdefgh",
        passwordConfirmation: "abcdefgh",
      }).password,
    ).toEqual(["Password must contain at least one number"]);
  });

  it("reports a mismatched confirmation under the confirmation field", () => {
    const errors = registerErrors({
      ...validRegistration,
      passwordConfirmation: "analytical2",
    });

    expect(errors.passwordConfirmation).toEqual(["Passwords do not match"]);
    expect(errors.password).toBeUndefined();
  });

  it("rejects missing fields", () => {
    const errors = registerErrors({});

    expect(Object.keys(errors).sort()).toEqual([
      "email",
      "name",
      "password",
      "passwordConfirmation",
    ]);
  });
});

describe("loginSchema", () => {
  it("accepts an email and a password", () => {
    const result = loginSchema.safeParse({
      email: "ada@example.com",
      password: "analytical1",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing password", () => {
    expect(loginSchema.safeParse({ email: "ada@example.com" }).success).toBe(
      false,
    );
  });

  it("rejects an empty email", () => {
    expect(
      loginSchema.safeParse({ email: "", password: "analytical1" }).success,
    ).toBe(false);
  });
});

describe("formatZodErrors", () => {
  it("returns a field-keyed map of messages", () => {
    const schema = z.object({ email: z.email("Enter a valid email address") });
    const result = schema.safeParse({ email: "nope" });

    expect(formatZodErrors(result.error!)).toEqual({
      email: ["Enter a valid email address"],
    });
  });

  it("puts form-level issues under the form key", () => {
    const schema = z
      .object({ a: z.string() })
      .refine(() => false, { error: "Something is off" });
    const result = schema.safeParse({ a: "x" });

    expect(formatZodErrors(result.error!)).toEqual({
      [FORM_ERROR_KEY]: ["Something is off"],
    });
  });
});
