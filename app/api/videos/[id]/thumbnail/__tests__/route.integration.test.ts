import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/videos/route";
import { prisma } from "@/app/_lib/db";
import { extractThumbnail, probeDuration } from "@/app/_lib/videos/probe";
import {
  bytes,
  signInAs,
  streamOf,
  withTempStorageRoot,
} from "@/tests/helpers/videos";
import { clearBrowserCookies } from "@/tests/helpers/auth";
import { GET } from "../route";

/**
 * `GET /api/videos/:id/thumbnail`, including the full round trip: upload
 * through the real POST handler, then fetch the thumbnail it produced.
 */

vi.mock("@/app/_lib/videos/probe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/_lib/videos/probe")>()),
  probeDuration: vi.fn(),
  extractThumbnail: vi.fn(),
}));

const storageRoot = withTempStorageRoot();

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(probeDuration).mockResolvedValue(10);
  vi.mocked(extractThumbnail).mockImplementation(async ({ destination }) => {
    await writeFile(destination, JPEG);
    return true;
  });
});

/** Uploads a small video as the signed-in user and returns its DTO. */
async function upload() {
  const data = bytes(1024);
  const response = await POST(
    new Request("http://localhost/api/videos?name=clip.mp4&size=1024", {
      method: "POST",
      body: streamOf(data),
      headers: {
        "content-type": "application/octet-stream",
        "content-length": "1024",
      },
      duplex: "half",
    } as RequestInit),
  );

  expect(response.status).toBe(201);

  return (await response.json()) as { id: string; thumbnailUrl: string };
}

function get(id: string) {
  return GET(new Request(`http://localhost/api/videos/${id}/thumbnail`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/videos/[id]/thumbnail", () => {
  it("streams the owner's JPEG with a private cache header", async () => {
    await signInAs();
    const video = await upload();

    const response = await get(video.id);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-length")).toBe(String(JPEG.length));
    expect(response.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(JPEG);
  });

  it("serves the URL the upload response advertised", async () => {
    await signInAs();
    const video = await upload();

    expect(video.thumbnailUrl).toBe(`/api/videos/${video.id}/thumbnail`);
    expect((await get(video.id)).status).toBe(200);
  });

  it("redirects to the placeholder when extraction failed", async () => {
    await signInAs();
    vi.mocked(extractThumbnail).mockResolvedValue(false);
    const video = await upload();

    const response = await get(video.id);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/placeholder-thumbnail.jpg");
  });

  it("returns 404 for another user's video", async () => {
    await signInAs({ email: "owner@example.com" });
    const video = await upload();

    clearBrowserCookies();
    await signInAs({ email: "intruder@example.com" });

    expect((await get(video.id)).status).toBe(404);
  });

  it("returns 404 for a video that does not exist", async () => {
    await signInAs();

    const response = await get("clv0000000000000000000000");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "THUMB_NOT_FOUND",
    });
  });

  it("returns 404, not 401, when unauthenticated", async () => {
    await signInAs();
    const video = await upload();
    clearBrowserCookies();

    expect((await get(video.id)).status).toBe(404);
  });

  it("returns 404 for an id that is not a cuid", async () => {
    await signInAs();

    expect((await get("../../etc")).status).toBe(404);
  });

  it("returns 404 when the row points at a thumbnail missing from disk", async () => {
    const user = await signInAs();
    const video = await upload();
    await rm(path.join(storageRoot(), user.id, video.id, "thumbnail.jpg"));

    expect((await get(video.id)).status).toBe(404);
  });

  it("returns 404 when a stored path would escape the storage root", async () => {
    await signInAs();
    const video = await upload();
    await prisma.video.update({
      where: { id: video.id },
      data: { thumbnailPath: "../../etc/hosts" },
    });

    expect((await get(video.id)).status).toBe(404);
  });
});
