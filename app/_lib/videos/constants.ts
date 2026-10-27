/**
 * Upload rules shared by the browser and the server.
 *
 * This module is imported by client components, so it must stay free of Node
 * APIs and of anything read from `process.env` — the server-only knobs
 * (`VIDEO_STORAGE_ROOT`, `VIDEO_MAX_BYTES`) live in `config.ts`.
 */

/** Lowercased, without the dot. Doubles as the stored `container_format`. */
export const ALLOWED_EXTENSIONS = ["mp4", "mov", "mkv", "webm", "avi"] as const;

export type VideoContainerFormat = (typeof ALLOWED_EXTENSIONS)[number];

/**
 * Advisory only: browsers report AVI and MKV inconsistently, so the extension
 * is the real gate. The client sends `application/octet-stream` on the wire.
 */
export const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
  "video/x-msvideo",
] as const;

/** `Content-Type` values the upload endpoint accepts. */
export const ACCEPTED_UPLOAD_CONTENT_TYPES: readonly string[] = [
  "application/octet-stream",
  ...ALLOWED_MIME_TYPES,
];

/** 2 GiB — binary gigabytes, the convention file managers display. */
export const DEFAULT_MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

/** Longest original filename the `video` table stores. */
export const MAX_FILENAME_LENGTH = 255;

/** Longest title; F04's rename rules use the same cap. */
export const MAX_TITLE_LENGTH = 200;

/** Served from `public/` when a video has no extracted thumbnail. */
export const PLACEHOLDER_THUMBNAIL_PATH = "/placeholder-thumbnail.jpg";

/** Value for the file picker's `accept` attribute. */
export const FILE_INPUT_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(
  ",",
);

/**
 * Returns the lowercased extension of `filename` when it is one we accept,
 * otherwise `null`. Case-insensitive, so `CLIP.MP4` passes.
 */
export function allowedExtensionOf(
  filename: string,
): VideoContainerFormat | null {
  const dot = filename.lastIndexOf(".");

  if (dot <= 0 || dot === filename.length - 1) {
    return null;
  }

  const extension = filename.slice(dot + 1).toLowerCase();

  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extension)
    ? (extension as VideoContainerFormat)
    : null;
}

/**
 * Default title: the filename without its extension, trimmed and capped. Falls
 * back to the full name when stripping the extension would leave nothing.
 */
export function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = (dot > 0 ? filename.slice(0, dot) : filename).trim();

  return (base || filename.trim()).slice(0, MAX_TITLE_LENGTH);
}
