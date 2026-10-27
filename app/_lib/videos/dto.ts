import type { VideoContainerFormat } from "@/app/_lib/videos/constants";
import type { VideoStatus } from "@/app/_lib/videos/status";

/**
 * The public shape of a video, as returned by `POST /api/videos` and passed to
 * client components. Plain JSON only: no `Date`, no `BigInt`, no `Decimal`, and
 * no filesystem paths.
 */
export type VideoDTO = {
  id: string;
  title: string;
  description: string;
  originalFilename: string;
  sizeBytes: number;
  durationSeconds: number | null;
  containerFormat: VideoContainerFormat;
  status: VideoStatus;
  /** Always the thumbnail endpoint; it redirects to the placeholder itself. */
  thumbnailUrl: string;
  /** `false` when extraction failed and the placeholder is being served. */
  hasCustomThumbnail: boolean;
  /** ISO 8601. */
  createdAt: string;
};

export function thumbnailUrlFor(videoId: string): string {
  return `/api/videos/${videoId}/thumbnail`;
}
