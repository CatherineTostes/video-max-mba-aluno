import { describe, expect, it } from "vitest";

import { DUMMY_HASH, hashPassword, verifyPassword } from "../password";

const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

describe("hashPassword", () => {
  it("produces a cost-12 bcrypt hash", async () => {
    const hash = await hashPassword("analytical1");

    expect(hash).toMatch(BCRYPT_PATTERN);
    expect(hash).toHaveLength(60);
    expect(hash.startsWith("$2b$12$")).toBe(true);
  });

  it("never returns the plain text", async () => {
    await expect(hashPassword("analytical1")).resolves.not.toBe("analytical1");
  });

  it("salts, so the same password hashes differently each time", async () => {
    const [first, second] = await Promise.all([
      hashPassword("analytical1"),
      hashPassword("analytical1"),
    ]);

    expect(first).not.toBe(second);
  });
});

describe("verifyPassword", () => {
  it("accepts the password the hash was made from", async () => {
    const hash = await hashPassword("analytical1");

    await expect(verifyPassword("analytical1", hash)).resolves.toBe(true);
  });

  it("rejects any other password", async () => {
    const hash = await hashPassword("analytical1");

    await expect(verifyPassword("analytical2", hash)).resolves.toBe(false);
  });
});

describe("DUMMY_HASH", () => {
  it("is a valid bcrypt hash at the same cost as a real one", () => {
    expect(DUMMY_HASH).toMatch(BCRYPT_PATTERN);
    expect(DUMMY_HASH.startsWith("$2b$12$")).toBe(true);
  });

  it("can be compared against without throwing, and never matches", async () => {
    await expect(verifyPassword("analytical1", DUMMY_HASH)).resolves.toBe(
      false,
    );
  });

  it("costs about as long to compare as a real hash", async () => {
    const realHash = await hashPassword("analytical1");

    const timeOf = async (hash: string) => {
      const started = performance.now();
      await verifyPassword("analytical1", hash);
      return performance.now() - started;
    };

    // Warm up so JIT and module init do not land on whichever runs first.
    await timeOf(realHash);

    const dummyMs = await timeOf(DUMMY_HASH);
    const realMs = await timeOf(realHash);

    // Soft check: the point is that an unknown email cannot be told from a
    // wrong password by timing, not that the two are identical to the
    // microsecond.
    expect(Math.abs(dummyMs - realMs) / realMs).toBeLessThan(0.5);
  });
});
