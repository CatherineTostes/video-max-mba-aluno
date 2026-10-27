import "server-only";

import path from "node:path";

import { DEFAULT_MAX_VIDEO_BYTES } from "@/app/_lib/videos/constants";

/**
 * Server-side upload settings read from the environment.
 *
 * Both are read on every call rather than once at module load, so a test can
 * point a single suite at its own temp directory or a tiny size cap.
 */

const DEFAULT_STORAGE_ROOT = "storage/videos";

/**
 * Absolute path to the directory that holds every user's videos. A relative
 * `VIDEO_STORAGE_ROOT` resolves against the project root (the process cwd).
 */
export function getVideoStorageRoot(): string {
  const configured = process.env.VIDEO_STORAGE_ROOT?.trim();

  // The ignore comment stops Turbopack's file tracing from treating this
  // runtime-only path as a reason to bundle the whole project directory.
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    configured || DEFAULT_STORAGE_ROOT,
  );
}

/**
 * Per-file size cap in bytes. `VIDEO_MAX_BYTES` may lower it (tests do); it
 * falls back to 2 GiB when unset or not a positive integer.
 */
export function getMaxVideoBytes(): number {
  const configured = Number(process.env.VIDEO_MAX_BYTES);

  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_VIDEO_BYTES;
}
