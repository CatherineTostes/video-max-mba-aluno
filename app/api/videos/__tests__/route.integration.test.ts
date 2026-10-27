import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/app/_lib/db";
import { extractThumbnail, probeDuration } from "@/app/_lib/videos/probe";
import { moveToFinal } from "@/app/_lib/videos/storage";
import {
  brokenStream,
  bytes,
  signInAs,
  streamOf,
  withTempStorageRoot,
} from "@/tests/helpers/videos";
import { POST } from "../route";

/**
 * `POST /api/videos` called the way Next.js calls it — with a `Request` — over
 * a real database and a temp storage root. The session cookie comes from the
 * stubbed `next/headers` jar, exactly as F02's suites drive auth.
 */

vi.mock("@/app/_lib/videos/probe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/_lib/videos/probe")>()),
  probeDuration: vi.fn(),
  extractThumbnail: vi.fn(),
}));

vi.mock("@/app/_lib/videos/storage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/app/_lib/videos/storage")>();

  return { ...actual, moveToFinal: vi.fn(actual.moveToFinal) };
});

const storageRoot = withTempStorageRoot();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(probeDuration).mockResolvedValue(1823.4);
  vi.mocked(extractThumbnail).mockImplementation(async ({ destination }) => {
    await writeFile(destination, "fake-jpeg");
    return true;
  });
});

type RequestOptions = {
  name?: string | null;
  size?: string | number | null;
  body?: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: string | number | null;
};

function uploadRequest(options: RequestOptions = {}): Request {
  const data = bytes(2048);
  const {
    name = "morning-standup.mp4",
    size = data.length,
    body = streamOf(data, 512),
    contentType = "application/octet-stream",
    contentLength = size,
  } = options;

  const url = new URL("http://localhost:3000/api/videos");

  if (name !== null) url.searchParams.set("name", name);
  if (size !== null) url.searchParams.set("size", String(size));

  const headers = new Headers({ "content-type": contentType });

  if (contentLength !== null) {
    headers.set("content-length", String(contentLength));
  }

  return new Request(url, {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
}

async function storedFiles(): Promise<string[]> {
  const entries = await readdir(storageRoot(), {
    recursive: true,
    withFileTypes: true,
  });

  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({ code });
}

describe("POST /api/videos", () => {
  it("returns 201 with the full video DTO", async () => {
    const user = await signInAs();

    const response = await POST(uploadRequest());

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      id: expect.stringMatching(/^[a-z0-9]{20,32}$/),
      title: "morning-standup",
      description: "",
      originalFilename: "morning-standup.mp4",
      sizeBytes: 2048,
      durationSeconds: 1823.4,
      containerFormat: "mp4",
      status: "validating",
      thumbnailUrl: `/api/videos/${body.id}/thumbnail`,
      hasCustomThumbnail: true,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });

    const row = await prisma.video.findUniqueOrThrow({ where: { id: body.id } });
    expect(row.userId).toBe(user.id);
    expect(
      existsSync(path.join(storageRoot(), user.id, body.id, "source.mp4")),
    ).toBe(true);
  });

  it("makes the new video visible in the owner's library right away", async () => {
    const user = await signInAs();

    const created = await (await POST(uploadRequest())).json();

    const library = await prisma.video.findMany({ where: { userId: user.id } });
    expect(library).toHaveLength(1);
    expect(library[0]).toMatchObject({ id: created.id, status: "validating" });
  });

  it("returns 401 without a session and stores nothing", async () => {
    const response = await POST(uploadRequest());

    await expectError(response, 401, "UPL_UNAUTHORIZED");
    await expect(prisma.video.count()).resolves.toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("returns 400 UPL_MISSING_NAME when the name is absent", async () => {
    await signInAs();

    await expectError(
      await POST(uploadRequest({ name: null })),
      400,
      "UPL_MISSING_NAME",
    );
  });

  it("returns 400 UPL_BAD_EXTENSION for an .mpg", async () => {
    await signInAs();

    const response = await POST(uploadRequest({ name: "video.mpg" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "UPL_BAD_EXTENSION",
      message: "Only MP4, MOV, MKV, WEBM, and AVI files are supported",
    });
  });

  it("returns 400 UPL_MISSING_SIZE when the size is absent", async () => {
    await signInAs();

    await expectError(
      await POST(uploadRequest({ size: null, contentLength: 2048 })),
      400,
      "UPL_MISSING_SIZE",
    );
  });

  it("returns 413 UPL_TOO_LARGE when the declared size is over 2GB", async () => {
    await signInAs();
    const tooBig = 2 * 1024 * 1024 * 1024 + 1;

    const response = await POST(uploadRequest({ size: tooBig }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      code: "UPL_TOO_LARGE",
      message: "Files must be at most 2GB",
    });
  });

  it("returns 400 UPL_SIZE_MISMATCH when size and Content-Length disagree", async () => {
    await signInAs();

    await expectError(
      await POST(uploadRequest({ size: 2048, contentLength: 4096 })),
      400,
      "UPL_SIZE_MISMATCH",
    );
  });

  it("returns 400 UPL_BAD_MIME for a non-video content type", async () => {
    await signInAs();

    await expectError(
      await POST(uploadRequest({ contentType: "text/plain" })),
      400,
      "UPL_BAD_MIME",
    );
  });

  it("returns 413 and deletes the partial file when the body overshoots mid-stream", async () => {
    await signInAs();
    process.env.VIDEO_MAX_BYTES = "1024";

    // Headers claim 1 KB; the body keeps going (a lying or broken client).
    const response = await POST(
      uploadRequest({ size: 1024, body: streamOf(bytes(3072), 512) }),
    );

    await expectError(response, 413, "UPL_TOO_LARGE");
    await expect(prisma.video.count()).resolves.toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("returns 400 UPL_INCOMPLETE when the client disconnects early", async () => {
    await signInAs();

    const response = await POST(uploadRequest({ body: brokenStream(512) }));

    await expectError(response, 400, "UPL_INCOMPLETE");
    await expect(prisma.video.count()).resolves.toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("returns 500 UPL_DISK_WRITE when the filesystem fails, with no row", async () => {
    await signInAs();
    vi.mocked(moveToFinal).mockRejectedValueOnce(new Error("ENOSPC"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(uploadRequest());

    expect(response.status).toBe(500);
    // The PRD copy, never the filesystem error.
    await expect(response.json()).resolves.toEqual({
      code: "UPL_DISK_WRITE",
      message: "Upload failed — please try again",
    });
    await expect(prisma.video.count()).resolves.toBe(0);
    consoleError.mockRestore();
  });

  it("still returns 201 when thumbnail extraction fails", async () => {
    await signInAs();
    vi.mocked(extractThumbnail).mockResolvedValue(false);

    const response = await POST(uploadRequest());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      hasCustomThumbnail: false,
      status: "validating",
    });
  });
});
