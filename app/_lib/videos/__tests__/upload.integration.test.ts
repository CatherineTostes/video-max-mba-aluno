import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/app/_lib/db";
import { seedUser } from "@/tests/helpers/auth";
import {
  brokenStream,
  bytes,
  streamOf,
  withTempStorageRoot,
} from "@/tests/helpers/videos";
import { VideoUploadError } from "../errors";
import { extractThumbnail, probeDuration } from "../probe";
import { moveToFinal } from "../storage";
import { uploadVideo, type UploadVideoInput } from "../upload";

/**
 * The orchestrator end to end — real Postgres, real filesystem (a temp root),
 * stubbed ffprobe/ffmpeg so each probe outcome can be forced.
 */

vi.mock("../probe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../probe")>()),
  probeDuration: vi.fn(),
  extractThumbnail: vi.fn(),
}));

vi.mock("../storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage")>();

  return { ...actual, moveToFinal: vi.fn(actual.moveToFinal) };
});

const probeDurationMock = vi.mocked(probeDuration);
const extractThumbnailMock = vi.mocked(extractThumbnail);
const moveToFinalMock = vi.mocked(moveToFinal);

const storageRoot = withTempStorageRoot();

beforeEach(() => {
  vi.clearAllMocks();
  probeDurationMock.mockResolvedValue(120.5);
  extractThumbnailMock.mockImplementation(async ({ destination }) => {
    await writeFile(destination, "fake-jpeg");
    return true;
  });
});

function input(
  userId: string,
  overrides: Partial<UploadVideoInput> = {},
): UploadVideoInput {
  const body = bytes(1000);

  return {
    userId,
    body: streamOf(body, 300),
    declaredName: "morning-standup.mp4",
    declaredSize: String(body.length),
    declaredMime: "application/octet-stream",
    ...overrides,
  };
}

async function expectUploadError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );

  expect(error).toBeInstanceOf(VideoUploadError);
  expect((error as VideoUploadError).code).toBe(code);
}

/** Every file under the storage root, relative to it. */
async function storedFiles(): Promise<string[]> {
  const entries = await readdir(storageRoot(), {
    recursive: true,
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(storageRoot(), path.join(entry.parentPath, entry.name)),
    )
    .sort();
}

describe("uploadVideo", () => {
  it("persists a validating row and the file under the user's directory", async () => {
    const { user } = await seedUser();
    const body = bytes(1000);

    const dto = await uploadVideo(
      input(user.id, { body: streamOf(body, 300) }),
    );

    const row = await prisma.video.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row).toMatchObject({
      userId: user.id,
      status: "validating",
      sizeBytes: BigInt(1000),
      containerFormat: "mp4",
      originalFilename: "morning-standup.mp4",
      description: "",
      storagePath: `${user.id}/${dto.id}/source.mp4`,
    });

    const source = path.join(storageRoot(), user.id, dto.id, "source.mp4");
    expect(Buffer.compare(await readFile(source), Buffer.from(body))).toBe(0);
    expect(dto.sizeBytes).toBe(1000);
    expect(dto.status).toBe("validating");
  });

  it("leaves no temp file behind after a successful upload", async () => {
    const { user } = await seedUser();

    const dto = await uploadVideo(input(user.id));

    expect(await storedFiles()).toEqual([
      `${user.id}/${dto.id}/source.mp4`,
      `${user.id}/${dto.id}/thumbnail.jpg`,
    ]);
  });

  it("defaults the title to the filename without its extension", async () => {
    const { user } = await seedUser();

    const dto = await uploadVideo(input(user.id));

    expect(dto.title).toBe("morning-standup");
  });

  it("caps the default title at 200 characters", async () => {
    const { user } = await seedUser();

    const dto = await uploadVideo(
      input(user.id, { declaredName: `${"a".repeat(250)}.mp4` }),
    );

    expect(dto.title).toHaveLength(200);
  });

  it("stores the lowercased extension as the container format", async () => {
    const { user } = await seedUser();

    const dto = await uploadVideo(input(user.id, { declaredName: "CLIP.MOV" }));

    expect(dto.containerFormat).toBe("mov");
    expect(
      existsSync(path.join(storageRoot(), user.id, dto.id, "source.mov")),
    ).toBe(true);
  });

  it("rejects a stream that exceeds the size cap, with no row and no file", async () => {
    const { user } = await seedUser();
    process.env.VIDEO_MAX_BYTES = "1000";

    // Declares an acceptable size, then sends more than the cap.
    await expectUploadError(
      uploadVideo(
        input(user.id, { body: streamOf(bytes(1500), 400), declaredSize: "1000" }),
      ),
      "UPL_TOO_LARGE",
    );

    await expect(prisma.video.count()).resolves.toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("rejects a declared size above the cap before reading the body", async () => {
    const { user } = await seedUser();
    process.env.VIDEO_MAX_BYTES = "1000";

    await expectUploadError(
      uploadVideo(input(user.id, { declaredSize: "1001" })),
      "UPL_TOO_LARGE",
    );

    expect(existsSync(path.join(storageRoot(), user.id))).toBe(false);
  });

  it("rejects an unsupported extension with no row and no file", async () => {
    const { user } = await seedUser();

    await expectUploadError(
      uploadVideo(input(user.id, { declaredName: "clip.mpg" })),
      "UPL_BAD_EXTENSION",
    );

    await expect(prisma.video.count()).resolves.toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it.each([
    [{ declaredName: null }, "UPL_MISSING_NAME"],
    [{ declaredName: "   " }, "UPL_MISSING_NAME"],
    [{ declaredName: `${"a".repeat(252)}.mp4` }, "UPL_MISSING_NAME"],
    [{ declaredSize: null }, "UPL_MISSING_SIZE"],
    [{ declaredSize: "0" }, "UPL_MISSING_SIZE"],
    [{ declaredSize: "12abc" }, "UPL_MISSING_SIZE"],
    [{ declaredMime: "text/plain" }, "UPL_BAD_MIME"],
    [{ declaredMime: null }, "UPL_BAD_MIME"],
    [{ contentLength: "999" }, "UPL_SIZE_MISMATCH"],
    [{ contentLength: null }, "UPL_SIZE_MISMATCH"],
  ] as const)("rejects %j with %s", async (overrides, code) => {
    const { user } = await seedUser();

    await expectUploadError(uploadVideo(input(user.id, overrides)), code);

    await expect(prisma.video.count()).resolves.toBe(0);
  });

  it("accepts a video MIME type as well as octet-stream", async () => {
    const { user } = await seedUser();

    await expect(
      uploadVideo(input(user.id, { declaredMime: "video/quicktime" })),
    ).resolves.toMatchObject({ status: "validating" });
  });

  it("fails with UPL_INCOMPLETE when the client disconnects mid-stream", async () => {
    const { user } = await seedUser();

    await expectUploadError(
      uploadVideo(input(user.id, { body: brokenStream(400) })),
      "UPL_INCOMPLETE",
    );

    await expect(prisma.video.count()).resolves.toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("fails with UPL_INCOMPLETE when the stream ends short of the declared size", async () => {
    const { user } = await seedUser();

    await expectUploadError(
      uploadVideo(input(user.id, { body: streamOf(bytes(600)) })),
      "UPL_INCOMPLETE",
    );

    await expect(prisma.video.count()).resolves.toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("records the duration when the probe succeeds", async () => {
    const { user } = await seedUser();

    const dto = await uploadVideo(input(user.id));

    expect(dto.durationSeconds).toBe(120.5);
    const row = await prisma.video.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row.durationSeconds?.toNumber()).toBe(120.5);
  });

  it("keeps the upload with a null duration when the probe fails", async () => {
    const { user } = await seedUser();
    probeDurationMock.mockResolvedValue(null);

    const dto = await uploadVideo(input(user.id));

    expect(dto.durationSeconds).toBeNull();
    expect(dto.status).toBe("validating");
    // Unknown duration: grab the very first frame.
    expect(extractThumbnailMock).toHaveBeenCalledWith(
      expect.objectContaining({ atSeconds: 0 }),
    );
  });

  it("extracts the thumbnail 10% in and records its path", async () => {
    const { user } = await seedUser();

    const dto = await uploadVideo(input(user.id));

    expect(extractThumbnailMock).toHaveBeenCalledWith({
      source: path.join(storageRoot(), user.id, dto.id, "source.mp4"),
      destination: path.join(storageRoot(), user.id, dto.id, "thumbnail.jpg"),
      atSeconds: 12.05,
    });
    expect(dto.hasCustomThumbnail).toBe(true);
    expect(dto.thumbnailUrl).toBe(`/api/videos/${dto.id}/thumbnail`);

    const row = await prisma.video.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row.thumbnailPath).toBe(`${user.id}/${dto.id}/thumbnail.jpg`);
    expect(
      existsSync(path.join(storageRoot(), user.id, dto.id, "thumbnail.jpg")),
    ).toBe(true);
  });

  it("keeps the upload with no thumbnail when extraction fails", async () => {
    const { user } = await seedUser();
    extractThumbnailMock.mockResolvedValue(false);

    const dto = await uploadVideo(input(user.id));

    expect(dto.hasCustomThumbnail).toBe(false);
    const row = await prisma.video.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row.thumbnailPath).toBeNull();
    expect(row.status).toBe("validating");
  });

  it("keeps the upload when post-processing itself throws", async () => {
    const { user } = await seedUser();
    probeDurationMock.mockRejectedValue(new Error("unexpected"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const dto = await uploadVideo(input(user.id));

    expect(dto).toMatchObject({ durationSeconds: null, hasCustomThumbnail: false });
    await expect(prisma.video.count()).resolves.toBe(1);
    consoleError.mockRestore();
  });

  it("rolls the row back and cleans up when moving the file fails", async () => {
    const { user } = await seedUser();
    moveToFinalMock.mockRejectedValueOnce(new VideoUploadError("UPL_DISK_WRITE"));

    await expectUploadError(uploadVideo(input(user.id)), "UPL_DISK_WRITE");

    await expect(prisma.video.count()).resolves.toBe(0);
    expect(await storedFiles()).toEqual([]);
  });

  it("keeps two users' identically named files apart", async () => {
    const { user: ada } = await seedUser({ email: "ada@example.com" });
    const { user: grace } = await seedUser({ email: "grace@example.com" });

    const first = await uploadVideo(
      input(ada.id, { body: streamOf(bytes(1000).fill(1)) }),
    );
    const second = await uploadVideo(
      input(grace.id, { body: streamOf(bytes(1000).fill(2)) }),
    );

    const adaFile = path.join(storageRoot(), ada.id, first.id, "source.mp4");
    const graceFile = path.join(storageRoot(), grace.id, second.id, "source.mp4");

    expect(adaFile).not.toBe(graceFile);
    expect((await readFile(adaFile))[0]).toBe(1);
    expect((await readFile(graceFile))[0]).toBe(2);
  });

  it("deletes a user's videos with the user (cascade for F12)", async () => {
    const { user } = await seedUser();
    await uploadVideo(input(user.id));

    await prisma.user.delete({ where: { id: user.id } });

    await expect(prisma.video.count()).resolves.toBe(0);
  });

  it("refuses an invalid status at the database level", async () => {
    const { user } = await seedUser();
    const dto = await uploadVideo(input(user.id));

    await expect(
      prisma.video.update({ where: { id: dto.id }, data: { status: "bogus" } }),
    ).rejects.toThrow();
  });
});
