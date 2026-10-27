import "server-only";

import { prisma } from "@/app/_lib/db";
import { getMaxVideoBytes } from "@/app/_lib/videos/config";
import {
  ACCEPTED_UPLOAD_CONTENT_TYPES,
  allowedExtensionOf,
  MAX_FILENAME_LENGTH,
  titleFromFilename,
  type VideoContainerFormat,
} from "@/app/_lib/videos/constants";
import type { VideoDTO } from "@/app/_lib/videos/dto";
import { VideoUploadError } from "@/app/_lib/videos/errors";
import {
  extractThumbnail,
  probeDuration,
  thumbnailOffsetSeconds,
} from "@/app/_lib/videos/probe";
import {
  createVideoInitial,
  setDuration,
  setStoragePath,
  setThumbnailPath,
  toVideoDTO,
} from "@/app/_lib/videos/repository";
import {
  ensureUserDir,
  moveToFinal,
  removeFileQuietly,
  removeVideoDir,
  resolveVideoPaths,
  tempUploadPath,
  writeTempStream,
} from "@/app/_lib/videos/storage";
import type { Video } from "@/prisma/generated/client/client";

/**
 * Server-side upload orchestration.
 *
 * The order is what makes failures clean:
 *
 * 1. Validate the declared metadata — nothing touches the disk on a bad name.
 * 2. Stream the body into a temp file with a hard byte cap.
 * 3. In one transaction, insert the row and move the file into place. If the
 *    move fails the row rolls back, so the PRD's "do not create a video
 *    record" holds for disk failures.
 * 4. After commit, probe the duration and extract a thumbnail. Both are
 *    best-effort: a failure leaves the column null and the upload stands.
 */

export type UploadVideoInput = {
  userId: string;
  body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | null;
  declaredName: string | null;
  /** Raw `size` query param. */
  declaredSize: string | null;
  /** Raw `Content-Type` header. */
  declaredMime: string | null;
  /** Raw `Content-Length` header; checked against `declaredSize` when present. */
  contentLength?: string | null;
};

type ValidatedUpload = {
  originalFilename: string;
  extension: VideoContainerFormat;
  sizeBytes: number;
};

/**
 * Checks everything that can be checked before reading a single byte. The
 * order mirrors what a user would fix first: name, then size, then headers.
 */
export function validateUploadRequest(
  input: Omit<UploadVideoInput, "userId" | "body">,
  maxBytes: number = getMaxVideoBytes(),
): ValidatedUpload {
  const originalFilename = input.declaredName?.trim() ?? "";

  if (!originalFilename || originalFilename.length > MAX_FILENAME_LENGTH) {
    throw new VideoUploadError("UPL_MISSING_NAME");
  }

  const extension = allowedExtensionOf(originalFilename);

  if (!extension) {
    throw new VideoUploadError("UPL_BAD_EXTENSION");
  }

  const sizeBytes = parsePositiveInteger(input.declaredSize);

  if (sizeBytes === null) {
    throw new VideoUploadError("UPL_MISSING_SIZE");
  }

  if (sizeBytes > maxBytes) {
    throw new VideoUploadError("UPL_TOO_LARGE");
  }

  if (input.contentLength !== undefined) {
    // Without a Content-Length the body could be any size, so it is required.
    if (parsePositiveInteger(input.contentLength ?? null) !== sizeBytes) {
      throw new VideoUploadError("UPL_SIZE_MISMATCH");
    }
  }

  const mime = input.declaredMime?.split(";")[0]?.trim().toLowerCase() ?? "";

  if (!ACCEPTED_UPLOAD_CONTENT_TYPES.includes(mime)) {
    throw new VideoUploadError("UPL_BAD_MIME");
  }

  return { originalFilename, extension, sizeBytes };
}

export async function uploadVideo(input: UploadVideoInput): Promise<VideoDTO> {
  const maxBytes = getMaxVideoBytes();
  const { originalFilename, extension, sizeBytes } = validateUploadRequest(
    input,
    maxBytes,
  );

  if (!input.body) {
    throw new VideoUploadError("UPL_INCOMPLETE");
  }

  const userDirectory = await ensureUserDir(input.userId);
  const tempPath = tempUploadPath(userDirectory);

  let video: Video;

  try {
    const bytesWritten = await writeTempStream(tempPath, input.body, maxBytes);

    if (bytesWritten < sizeBytes) {
      throw new VideoUploadError("UPL_INCOMPLETE");
    }

    if (bytesWritten !== sizeBytes) {
      throw new VideoUploadError("UPL_SIZE_MISMATCH");
    }

    video = await persist({
      userId: input.userId,
      originalFilename,
      extension,
      sizeBytes: bytesWritten,
      tempPath,
    });
  } finally {
    // Gone already after a successful move; this only matters on failure.
    await removeFileQuietly(tempPath);
  }

  return toVideoDTO(await captureMediaDetails(video, extension));
}

async function persist({
  userId,
  originalFilename,
  extension,
  sizeBytes,
  tempPath,
}: {
  userId: string;
  originalFilename: string;
  extension: VideoContainerFormat;
  sizeBytes: number;
  tempPath: string;
}): Promise<Video> {
  let videoId: string | null = null;

  try {
    return await prisma.$transaction(async (tx) => {
      // The id comes from the insert, and the path comes from the id — so the
      // row is created first and its path filled in once the file is in place.
      const created = await createVideoInitial(
        {
          userId,
          title: titleFromFilename(originalFilename),
          originalFilename,
          sizeBytes,
          containerFormat: extension,
          storagePath: "",
        },
        tx,
      );
      videoId = created.id;

      const paths = resolveVideoPaths(userId, created.id, extension);
      await moveToFinal(tempPath, paths.source);

      return setStoragePath(created.id, paths.relativeSource, tx);
    });
  } catch (error) {
    // The row rolled back; make sure a file moved before the failure goes too.
    if (videoId) {
      await removeVideoDir(userId, videoId).catch(() => undefined);
    }

    if (error instanceof VideoUploadError) {
      throw error;
    }

    throw new VideoUploadError(
      "UPL_DISK_WRITE",
      error instanceof Error ? error.message : undefined,
    );
  }
}

/**
 * Best-effort duration probe and thumbnail extraction. Never throws: the row is
 * already committed and the user should see it whatever happens here.
 */
async function captureMediaDetails(
  video: Video,
  extension: VideoContainerFormat,
): Promise<Video> {
  let current = video;

  try {
    const paths = resolveVideoPaths(video.userId, video.id, extension);
    const duration = await probeDuration(paths.source);

    if (duration !== null) {
      current = await setDuration(video.id, duration);
    }

    const extracted = await extractThumbnail({
      source: paths.source,
      destination: paths.thumbnail,
      atSeconds: thumbnailOffsetSeconds(duration),
    });

    if (extracted) {
      current = await setThumbnailPath(video.id, paths.relativeThumbnail);
    }
  } catch (error) {
    console.error(`Post-upload processing failed for video ${video.id}`, error);
  }

  return current;
}

function parsePositiveInteger(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw.trim())) {
    return null;
  }

  const value = Number(raw.trim());

  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
