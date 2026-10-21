/**
 * Stand-in for `next/navigation`, aliased in for integration tests.
 *
 * The real `redirect()` throws a framework-internal error that only Next.js
 * knows how to unwind. This throws a recognisable error instead, so a test can
 * assert "the action redirected to /app" rather than "the action threw".
 */

export class TestRedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT: ${url}`);
    this.name = "TestRedirectError";
  }
}

export function redirect(url: string): never {
  throw new TestRedirectError(url);
}

export function permanentRedirect(url: string): never {
  throw new TestRedirectError(url);
}

export function notFound(): never {
  throw new Error("NEXT_NOT_FOUND");
}
