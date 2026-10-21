import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  formatSessionCookieValue,
  parseSessionCookieValue,
  readSessionCookie,
  setSessionCookie,
} from "../cookies";

type RecordedCookie = { name: string; value: string } & Record<string, unknown>;

const store = new Map<string, RecordedCookie>();

/** Mirrors Next.js rejecting cookie writes once the response has started. */
const jar = { writable: true };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => store.get(name),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      if (!jar.writable) {
        throw new Error(
          "Cookies can only be modified in a Server Action or Route Handler.",
        );
      }

      store.set(name, { name, value, ...options });
    },
  }),
}));

const SECRET = "unit-test-session-secret-at-least-32-chars";
const SESSION_ID = "p9dW5xKbQ2nQp5t3sVqY7hZ1mL0cR8aJ4eF6gH2iK3o";

beforeEach(() => {
  store.clear();
  jar.writable = true;
  vi.stubEnv("SESSION_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SESSION_COOKIE_NAME", () => {
  it("is the product-namespaced name the whole app agrees on", () => {
    expect(SESSION_COOKIE_NAME).toBe("videomax_session");
  });
});

describe("setSessionCookie", () => {
  it("writes the signed session id under the session cookie name", async () => {
    await setSessionCookie(SESSION_ID);

    const cookie = store.get(SESSION_COOKIE_NAME);

    expect(cookie?.value).toBe(formatSessionCookieValue(SESSION_ID));
    expect(cookie?.value.startsWith(`${SESSION_ID}.`)).toBe(true);
  });

  it("is HttpOnly, SameSite=Lax, and scoped to the whole site", async () => {
    await setSessionCookie(SESSION_ID);

    expect(store.get(SESSION_COOKIE_NAME)).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("lives for the 60-day absolute session cap", async () => {
    await setSessionCookie(SESSION_ID);

    expect(store.get(SESSION_COOKIE_NAME)?.maxAge).toBe(60 * 24 * 60 * 60);
  });

  it("is Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await setSessionCookie(SESSION_ID);

    expect(store.get(SESSION_COOKIE_NAME)?.secure).toBe(true);
  });

  it("is not Secure in development, where there is no HTTPS to require", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await setSessionCookie(SESSION_ID);

    expect(store.get(SESSION_COOKIE_NAME)?.secure).toBe(false);
  });

  it("refuses to sign with a missing or too-short secret", async () => {
    vi.stubEnv("SESSION_SECRET", "too-short");

    await expect(setSessionCookie(SESSION_ID)).rejects.toThrow(
      /SESSION_SECRET/,
    );
  });
});

describe("clearSessionCookie", () => {
  it("expires the cookie with Max-Age 0", async () => {
    await setSessionCookie(SESSION_ID);
    await clearSessionCookie();

    expect(store.get(SESSION_COOKIE_NAME)).toMatchObject({
      value: "",
      maxAge: 0,
      path: "/",
      httpOnly: true,
    });
  });

  it("reports failure instead of throwing when cookies cannot be written", async () => {
    // `getSession()` clears stale cookies, and it also runs during Server
    // Component render, where Next.js rejects the write.
    jar.writable = false;

    await expect(clearSessionCookie()).resolves.toBe(false);
  });
});

describe("readSessionCookie", () => {
  it("returns null when the cookie is absent", async () => {
    await expect(readSessionCookie()).resolves.toBeNull();
  });

  it("round-trips the session id it wrote", async () => {
    await setSessionCookie(SESSION_ID);

    await expect(readSessionCookie()).resolves.toBe(SESSION_ID);
  });
});

describe("parseSessionCookieValue", () => {
  it("rejects a value with no signature", () => {
    expect(parseSessionCookieValue(SESSION_ID)).toBeNull();
  });

  it("rejects a tampered session id", () => {
    const signed = formatSessionCookieValue(SESSION_ID);
    const [, signature] = signed.split(".");

    expect(parseSessionCookieValue(`someone-elses-id.${signature}`)).toBeNull();
  });

  it("rejects a signature made with a different secret", () => {
    const signed = formatSessionCookieValue(SESSION_ID);

    vi.stubEnv("SESSION_SECRET", `${SECRET}-rotated`);

    expect(parseSessionCookieValue(signed)).toBeNull();
  });

  it("rejects a signature of the wrong length", () => {
    expect(parseSessionCookieValue(`${SESSION_ID}.short`)).toBeNull();
  });
});
