import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSession } from "@/app/_lib/session";
import { SessionRedirect } from "../SessionRedirect";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/_lib/session", () => ({ getSession: vi.fn() }));

const getSessionMock = vi.mocked(getSession);
const redirectMock = vi.mocked(redirect);

describe("SessionRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an authenticated visitor to /app", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-1" });

    await SessionRedirect();

    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/app");
  });

  it("leaves an unauthenticated visitor on the landing page", async () => {
    getSessionMock.mockResolvedValue(null);

    await expect(SessionRedirect()).resolves.toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
