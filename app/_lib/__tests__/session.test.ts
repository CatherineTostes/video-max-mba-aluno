import { describe, expect, it } from "vitest";

import { getSession } from "../session";

describe("getSession", () => {
  it("resolves to null until F02 replaces the stub", async () => {
    await expect(getSession()).resolves.toBeNull();
  });
});
