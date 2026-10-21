/**
 * In-memory stand-in for `next/headers`, aliased in for integration tests.
 *
 * The real module only works inside a Next.js request scope, which the
 * integration suites do not have. This jar gives the auth modules something to
 * read and write so a test can assert on what actually reached the browser,
 * and it enforces the same rule Next.js does: cookies can only be written
 * while the response headers are still open.
 */

export type TestCookie = {
  name: string;
  value: string;
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  secure?: boolean;
  maxAge?: number;
};

type SetOptions = Omit<TestCookie, "name" | "value">;

class TestCookieJar {
  #cookies = new Map<string, TestCookie>();

  /** Mirrors Next.js refusing cookie writes during Server Component render. */
  writable = true;

  get(name: string): TestCookie | undefined {
    return this.#cookies.get(name);
  }

  getAll(): TestCookie[] {
    return [...this.#cookies.values()];
  }

  has(name: string): boolean {
    return this.#cookies.has(name);
  }

  set(name: string, value: string, options: SetOptions = {}): void {
    if (!this.writable) {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler.",
      );
    }

    if (options.maxAge === 0) {
      this.#cookies.delete(name);
      return;
    }

    this.#cookies.set(name, { name, value, ...options });
  }

  delete(name: string): void {
    if (!this.writable) {
      throw new Error(
        "Cookies can only be modified in a Server Action or Route Handler.",
      );
    }

    this.#cookies.delete(name);
  }

  toString(): string {
    return this.getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }

  /** Test-only: drop every cookie and re-open the jar for writes. */
  reset(): void {
    this.#cookies.clear();
    this.writable = true;
  }

  /** Test-only: seed an incoming cookie without going through `set`. */
  seed(name: string, value: string): void {
    this.#cookies.set(name, { name, value });
  }
}

export const testCookieJar = new TestCookieJar();

export async function cookies(): Promise<TestCookieJar> {
  return testCookieJar;
}

export async function headers(): Promise<Headers> {
  return new Headers();
}
