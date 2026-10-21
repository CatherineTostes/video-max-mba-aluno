import { expect } from "vitest";

import {
  initialAuthFormState,
  type AuthFormState,
} from "@/app/_lib/auth/form-state";
import { SESSION_COOKIE_NAME } from "@/app/_lib/cookies";
import { prisma } from "@/app/_lib/db";
import { hashPassword } from "@/app/_lib/password";
import { testCookieJar } from "@/tests/stubs/next-headers";
import { TestRedirectError } from "@/tests/stubs/next-navigation";

/** Shared plumbing for the auth integration suites. */

export function formData(fields: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }

  return data;
}

type AuthAction = (
  state: AuthFormState,
  data: FormData,
) => Promise<AuthFormState>;

/**
 * Runs an auth action that is expected to fail, and returns its error map.
 *
 * Fails loudly if the action redirected instead — a silent success would
 * otherwise read as "no errors found".
 */
export async function runExpectingFailure(
  action: AuthAction,
  fields: Record<string, string>,
) {
  const state = await action(initialAuthFormState, formData(fields));

  expect(state.ok).toBe(false);

  return state.errors;
}

/**
 * Runs an auth action that is expected to succeed, asserting it redirected to
 * `destination`. Returns nothing — the effects worth asserting on are the
 * session row and the cookie.
 */
export async function runExpectingRedirect(
  action: AuthAction,
  fields: Record<string, string>,
  destination: string,
): Promise<void> {
  await expectRedirect(
    action(initialAuthFormState, formData(fields)),
    destination,
  );
}

/**
 * Asserts a promise rejected with the stubbed `redirect()` signal pointing at
 * `destination`. A resolved promise means the action returned an error state
 * instead of navigating.
 */
export async function expectRedirect(
  promise: Promise<unknown>,
  destination: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );

  expect(error).toBeInstanceOf(TestRedirectError);
  expect((error as TestRedirectError).url).toBe(destination);
}

export type SeedUserOverrides = {
  name?: string;
  email?: string;
  password?: string;
  isAdmin?: boolean;
  isSuspended?: boolean;
};

/** Inserts a user with a real bcrypt hash, so login can actually verify it. */
export async function seedUser(overrides: SeedUserOverrides = {}) {
  const {
    name = "Ada Lovelace",
    email = "ada@example.com",
    password = "analytical1",
    isAdmin = false,
    isSuspended = false,
  } = overrides;

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      isAdmin,
      isSuspended,
    },
  });

  return { user, password };
}

/** The raw session cookie currently in the jar, if any. */
export function currentSessionCookie(): string | undefined {
  return testCookieJar.get(SESSION_COOKIE_NAME)?.value;
}

/** Forgets every cookie, as if the next call came from a fresh browser. */
export function clearBrowserCookies(): void {
  testCookieJar.reset();
}
