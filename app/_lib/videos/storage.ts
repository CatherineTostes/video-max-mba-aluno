import "server-only";

import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import { getVideoStorageRoot } from "@/app/_lib/videos/config";
import { VideoUploadError } from "@/app/_lib/videos/errors";

/**
 * Filesystem layout for uploaded videos.
 *
 *   <root>/<userId>/<videoId>/source.<ext>
 *   <root>/<userId>/<videoId>/thumbnail.jpg
 *
 * One directory per user makes "delete this user" a single `rm -rf`; one per
 * video keeps the source and everything derived from it together. The DB
 * stores paths relative to the root, so the root can move without a rewrite.
 *
 * Every path that leaves this module has been checked to sit inside the root.
 * Ids come from our own database, so an escape "should not happen" — the check
 * is there so that it cannot.
 */

export type VideoPaths = {
  /** Absolute directory holding this video's files. */
  directory: string;
  /** Absolute path of the uploaded file. */
  source: string;
  /** Absolute path of the extracted thumbnail. */
  thumbnail: string;
  /** `source`, relative to the storage root — what goes in `storage_path`. */
  relativeSource: string;
  /** `thumbnail`, relative to the storage root — what goes in `thumbnail_path`. */
  relativeThumbnail: string;
};

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export const THUMBNAIL_FILENAME = "thumbnail.jpg";

function assertSafeSegment(segment: string): void {
  if (!SAFE_SEGMENT.test(segment)) {
    throw new VideoUploadError("UPL_PATH_TRAVERSAL");
  }
}

/** Resolves `segments` under the root, refusing anything that lands outside. */
function insideRoot(...segments: string[]): string {
  const root = getVideoStorageRoot();
  const resolved = path.resolve(root, ...segments);

  if (!resolved.startsWith(root + path.sep)) {
    throw new VideoUploadError("UPL_PATH_TRAVERSAL");
  }

  return resolved;
}

function relativeToRoot(absolutePath: string): string {
  // Stored with forward slashes so the value means the same thing on any OS.
  return path
    .relative(getVideoStorageRoot(), absolutePath)
    .split(path.sep)
    .join("/");
}

export function resolveVideoPaths(
  userId: string,
  videoId: string,
  extension: string,
): VideoPaths {
  assertSafeSegment(userId);
  assertSafeSegment(videoId);
  assertSafeSegment(extension);

  const directory = insideRoot(userId, videoId);
  const source = path.join(directory, `source.${extension}`);
  const thumbnail = path.join(directory, THUMBNAIL_FILENAME);

  return {
    directory,
    source,
    thumbnail,
    relativeSource: relativeToRoot(source),
    relativeThumbnail: relativeToRoot(thumbnail),
  };
}

/** Turns a stored relative path back into an absolute one, inside the root. */
export function resolveStoredPath(relativePath: string): string {
  return insideRoot(...relativePath.split("/"));
}

/** Creates `<root>/<userId>` if needed and returns it. */
export async function ensureUserDir(userId: string): Promise<string> {
  assertSafeSegment(userId);

  const directory = insideRoot(userId);

  try {
    await mkdir(directory, { recursive: true });
  } catch (error) {
    throw new VideoUploadError("UPL_DISK_WRITE", errorMessage(error));
  }

  return directory;
}

/**
 * A fresh temp path inside the user's directory. Same filesystem as the final
 * location, so promoting it is an atomic `rename` rather than a copy.
 */
export function tempUploadPath(userDirectory: string): string {
  return path.join(userDirectory, `.upload-${randomUUID()}.part`);
}

type ByteSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

/**
 * Streams `source` into `tempPath`, aborting once more than `maxBytes` have
 * arrived. Resolves with the number of bytes written.
 *
 * Failures are classified so the caller can answer with the right code: too
 * many bytes is `UPL_TOO_LARGE`, the client's stream breaking is
 * `UPL_INCOMPLETE`, and the disk refusing the write is `UPL_DISK_WRITE`. The
 * partial file is removed in every failure case.
 */
export async function writeTempStream(
  tempPath: string,
  source: ByteSource,
  maxBytes: number,
): Promise<number> {
  let bytesWritten = 0;

  async function* guarded() {
    const iterable: AsyncIterable<Uint8Array> =
      source instanceof ReadableStream
        ? Readable.fromWeb(source as NodeReadableStream<Uint8Array>)
        : source;

    try {
      for await (const chunk of iterable) {
        bytesWritten += chunk.byteLength;

        if (bytesWritten > maxBytes) {
          throw new VideoUploadError("UPL_TOO_LARGE");
        }

        yield chunk;
      }
    } catch (error) {
      if (error instanceof VideoUploadError) {
        throw error;
      }

      // Anything thrown while *reading* is the client's side going away.
      throw new VideoUploadError("UPL_INCOMPLETE", errorMessage(error));
    }
  }

  const file = createWriteStream(tempPath, { flags: "wx" });

  try {
    await pipeline(guarded(), file);
  } catch (error) {
    // The pipeline rejects as soon as the source fails, while the file handle
    // may still be opening or flushing. Deleting before it closes would race
    // and leave the partial file behind.
    if (!file.closed) {
      await new Promise<void>((resolve) => file.once("close", () => resolve()));
    }

    await removeFileQuietly(tempPath);

    if (error instanceof VideoUploadError) {
      throw error;
    }

    throw new VideoUploadError("UPL_DISK_WRITE", errorMessage(error));
  }

  return bytesWritten;
}

/** Moves the finished temp file to its permanent path. */
export async function moveToFinal(
  tempPath: string,
  finalPath: string,
): Promise<void> {
  try {
    await mkdir(path.dirname(finalPath), { recursive: true });
    await rename(tempPath, finalPath);
  } catch (error) {
    throw new VideoUploadError("UPL_DISK_WRITE", errorMessage(error));
  }
}

/** Deletes a video's directory and everything in it. Missing is fine. */
export async function removeVideoDir(
  userId: string,
  videoId: string,
): Promise<void> {
  assertSafeSegment(userId);
  assertSafeSegment(videoId);

  await rm(insideRoot(userId, videoId), { recursive: true, force: true });
}

export async function removeFileQuietly(filePath: string): Promise<void> {
  await rm(filePath, { force: true }).catch(() => undefined);
}

/**
 * Opens a stored file for streaming as a web `ReadableStream`, or returns
 * `null` when it is not on disk (or is not a regular file).
 */
export async function readThumbnailStream(
  absolutePath: string,
): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null> {
  try {
    const info = await stat(absolutePath);

    if (!info.isFile()) {
      return null;
    }

    const stream = Readable.toWeb(
      createReadStream(absolutePath),
    ) as ReadableStream<Uint8Array>;

    return { stream, size: info.size };
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
