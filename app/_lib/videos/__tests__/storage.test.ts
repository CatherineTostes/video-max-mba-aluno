// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { VideoUploadError } from "../errors";
import {
  ensureUserDir,
  moveToFinal,
  readThumbnailStream,
  removeVideoDir,
  resolveStoredPath,
  resolveVideoPaths,
  tempUploadPath,
  writeTempStream,
} from "../storage";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "videomax-storage-unit-"));
  process.env.VIDEO_STORAGE_ROOT = root;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  delete process.env.VIDEO_STORAGE_ROOT;
});

async function* chunks(...sizes: number[]) {
  for (const size of sizes) {
    yield new Uint8Array(size).fill(7);
  }
}

async function* failingAfter(size: number) {
  yield new Uint8Array(size);
  throw new Error("socket hang up");
}

async function expectUploadError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );

  expect(error).toBeInstanceOf(VideoUploadError);
  expect((error as VideoUploadError).code).toBe(code);
}

describe("resolveVideoPaths", () => {
  it("places source and thumbnail under <root>/<user>/<video>", () => {
    const paths = resolveVideoPaths("u1", "v1", "mp4");

    expect(paths.directory).toBe(path.join(root, "u1", "v1"));
    expect(paths.source).toBe(path.join(root, "u1", "v1", "source.mp4"));
    expect(paths.thumbnail).toBe(path.join(root, "u1", "v1", "thumbnail.jpg"));
    expect(paths.relativeSource).toBe("u1/v1/source.mp4");
    expect(paths.relativeThumbnail).toBe("u1/v1/thumbnail.jpg");
  });

  it.each([
    ["../etc", "v1", "mp4"],
    ["u1", "..", "mp4"],
    ["u1", "v1/../../x", "mp4"],
    ["u1", "v1", "mp4/../../x"],
    ["", "v1", "mp4"],
  ])("rejects traversal in (%j, %j, %j)", (userId, videoId, ext) => {
    expect(() => resolveVideoPaths(userId, videoId, ext)).toThrow(
      expect.objectContaining({ code: "UPL_PATH_TRAVERSAL" }),
    );
  });
});

describe("resolveStoredPath", () => {
  it("turns a stored relative path back into an absolute one", () => {
    expect(resolveStoredPath("u1/v1/thumbnail.jpg")).toBe(
      path.join(root, "u1", "v1", "thumbnail.jpg"),
    );
  });

  it("refuses a stored path that climbs out of the root", () => {
    expect(() => resolveStoredPath("../../etc/passwd")).toThrow(
      expect.objectContaining({ code: "UPL_PATH_TRAVERSAL" }),
    );
  });
});

describe("ensureUserDir", () => {
  it("creates the user's directory when it is missing", async () => {
    const directory = await ensureUserDir("u1");

    expect(directory).toBe(path.join(root, "u1"));
    expect(existsSync(directory)).toBe(true);
  });

  it("is fine when the directory already exists", async () => {
    await ensureUserDir("u1");

    await expect(ensureUserDir("u1")).resolves.toBe(path.join(root, "u1"));
  });
});

describe("writeTempStream", () => {
  it("writes every byte and reports the count", async () => {
    const tempPath = tempUploadPath(await ensureUserDir("u1"));

    await expect(writeTempStream(tempPath, chunks(400, 600), 1000)).resolves.toBe(
      1000,
    );
    expect((await readFile(tempPath)).byteLength).toBe(1000);
  });

  it("accepts a web ReadableStream", async () => {
    const tempPath = tempUploadPath(await ensureUserDir("u1"));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10));
        controller.close();
      },
    });

    await expect(writeTempStream(tempPath, stream, 100)).resolves.toBe(10);
  });

  it("aborts with UPL_TOO_LARGE past the cap and deletes the partial file", async () => {
    const directory = await ensureUserDir("u1");
    const tempPath = tempUploadPath(directory);

    await expectUploadError(
      writeTempStream(tempPath, chunks(500, 501), 1000),
      "UPL_TOO_LARGE",
    );
    expect(existsSync(tempPath)).toBe(false);
  });

  it("maps a source that breaks mid-stream to UPL_INCOMPLETE and cleans up", async () => {
    const tempPath = tempUploadPath(await ensureUserDir("u1"));

    await expectUploadError(
      writeTempStream(tempPath, failingAfter(100), 1000),
      "UPL_INCOMPLETE",
    );
    expect(existsSync(tempPath)).toBe(false);
  });

  it("maps a filesystem failure to UPL_DISK_WRITE", async () => {
    const missingDirectory = path.join(root, "does-not-exist", "x.part");

    await expectUploadError(
      writeTempStream(missingDirectory, chunks(10), 1000),
      "UPL_DISK_WRITE",
    );
  });

  it("gives every upload its own temp file", async () => {
    const directory = await ensureUserDir("u1");

    expect(tempUploadPath(directory)).not.toBe(tempUploadPath(directory));
  });
});

describe("moveToFinal", () => {
  it("moves the temp file into the video directory, creating it", async () => {
    const tempPath = tempUploadPath(await ensureUserDir("u1"));
    await writeFile(tempPath, "video");
    const { source } = resolveVideoPaths("u1", "v1", "mp4");

    await moveToFinal(tempPath, source);

    expect(existsSync(tempPath)).toBe(false);
    expect(await readFile(source, "utf8")).toBe("video");
  });

  it("maps a failed move to UPL_DISK_WRITE", async () => {
    await expectUploadError(
      moveToFinal(path.join(root, "missing.part"), path.join(root, "u1", "v1", "source.mp4")),
      "UPL_DISK_WRITE",
    );
  });
});

describe("removeVideoDir", () => {
  it("deletes the source, the thumbnail, and the directory", async () => {
    const paths = resolveVideoPaths("u1", "v1", "mp4");
    await mkdir(paths.directory, { recursive: true });
    await writeFile(paths.source, "video");
    await writeFile(paths.thumbnail, "jpeg");

    await removeVideoDir("u1", "v1");

    expect(existsSync(paths.directory)).toBe(false);
    expect(await readdir(path.join(root, "u1"))).toEqual([]);
  });

  it("does nothing when the directory is already gone", async () => {
    await expect(removeVideoDir("u1", "v1")).resolves.toBeUndefined();
  });
});

describe("readThumbnailStream", () => {
  it("streams an existing file with its size", async () => {
    const paths = resolveVideoPaths("u1", "v1", "mp4");
    await mkdir(paths.directory, { recursive: true });
    await writeFile(paths.thumbnail, "jpeg-bytes");

    const result = await readThumbnailStream(paths.thumbnail);

    expect(result?.size).toBe(10);
    expect(await new Response(result!.stream).text()).toBe("jpeg-bytes");
  });

  it("returns null for a missing file", async () => {
    await expect(
      readThumbnailStream(path.join(root, "nope.jpg")),
    ).resolves.toBeNull();
  });

  it("returns null for a directory", async () => {
    await expect(readThumbnailStream(root)).resolves.toBeNull();
  });
});
