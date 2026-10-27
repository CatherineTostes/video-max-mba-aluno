import "server-only";

import { prisma } from "@/app/_lib/db";
import type { VideoContainerFormat } from "@/app/_lib/videos/constants";
import { thumbnailUrlFor, type VideoDTO } from "@/app/_lib/videos/dto";
import { isVideoStatus, VideoStatus } from "@/app/_lib/videos/status";
import { removeVideoDir } from "@/app/_lib/videos/storage";
import type { Video } from "@/prisma/generated/client/client";

/**
 * Prisma accessors for the `video` table.
 *
 * F03 owns the table, so later features (F04 library, F07 pipeline, F12 admin)
 * go through these rather than querying `prisma.video` ad hoc.
 */

/** Accepts either the client or an interactive-transaction client. */
type VideoDb = { video: typeof prisma.video };

export type NewVideo = {
  userId: string;
  title: string;
  originalFilename: string;
  sizeBytes: number;
  containerFormat: VideoContainerFormat;
  storagePath: string;
};

export async function createVideoInitial(
  data: NewVideo,
  db: VideoDb = prisma,
): Promise<Video> {
  return db.video.create({
    data: {
      ...data,
      sizeBytes: BigInt(data.sizeBytes),
      status: VideoStatus.Validating,
    },
  });
}

export async function setStoragePath(
  videoId: string,
  storagePath: string,
  db: VideoDb = prisma,
): Promise<Video> {
  return db.video.update({ where: { id: videoId }, data: { storagePath } });
}

export async function setDuration(
  videoId: string,
  seconds: number | null,
): Promise<Video> {
  return prisma.video.update({
    where: { id: videoId },
    // numeric(10,3): round here so the stored value equals what we return.
    data: { durationSeconds: seconds === null ? null : roundToMillis(seconds) },
  });
}

export async function setThumbnailPath(
  videoId: string,
  relativePath: string | null,
): Promise<Video> {
  return prisma.video.update({
    where: { id: videoId },
    data: { thumbnailPath: relativePath },
  });
}

/** The video if it exists and belongs to `userId`; otherwise `null`. */
export async function findVideoForUser(
  videoId: string,
  userId: string,
): Promise<Video | null> {
  return prisma.video.findFirst({ where: { id: videoId, userId } });
}

/** Most recent first — the library's default sort. */
export async function listVideosForUser(userId: string): Promise<Video[]> {
  return prisma.video.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Deletes the row and the video's directory (source + thumbnail). The row goes
 * first: a leftover directory is invisible to users, a leftover row is not.
 */
export async function deleteVideoCompletely(video: {
  id: string;
  userId: string;
}): Promise<void> {
  await prisma.video.deleteMany({ where: { id: video.id } });
  await removeVideoDir(video.userId, video.id);
}

export function toVideoDTO(video: Video): VideoDTO {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    originalFilename: video.originalFilename,
    // 2 GB fits comfortably in a double; JSON cannot carry a BigInt.
    sizeBytes: Number(video.sizeBytes),
    durationSeconds:
      video.durationSeconds === null ? null : video.durationSeconds.toNumber(),
    containerFormat: video.containerFormat as VideoContainerFormat,
    status: isVideoStatus(video.status) ? video.status : VideoStatus.Failed,
    thumbnailUrl: thumbnailUrlFor(video.id),
    hasCustomThumbnail: video.thumbnailPath !== null,
    createdAt: video.createdAt.toISOString(),
  };
}

function roundToMillis(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
