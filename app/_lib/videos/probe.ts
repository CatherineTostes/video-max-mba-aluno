import "server-only";

import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

import ffmpeg from "@ffmpeg-installer/ffmpeg";
import ffprobe from "@ffprobe-installer/ffprobe";

import { removeFileQuietly } from "@/app/_lib/videos/storage";

/**
 * Thin, failure-proof wrappers around the bundled `ffprobe` and `ffmpeg`.
 *
 * Neither function ever throws. A file the tools cannot read is not an upload
 * error: per the PRD the upload succeeds with a null duration and a placeholder
 * thumbnail, and F07's validate stage decides what to do with it. Isolating the
 * child processes here also lets the orchestrator's tests stub this module.
 */

/** Long enough for a 2 GB file on a slow disk; short enough to not hang a request. */
const PROBE_TIMEOUT_MS = 30_000;
const THUMBNAIL_TIMEOUT_MS = 60_000;
/** Reading every packet of a 2 GB file is disk-bound; allow for a slow disk. */
const PACKET_SCAN_TIMEOUT_MS = 120_000;

/** Seek cap, so a huge file is not decoded deep into its timeline. */
const MAX_THUMBNAIL_OFFSET_SECONDS = 60;
const THUMBNAIL_POSITION = 0.1;

/** `scale=640:-2` keeps the aspect ratio with an even height (JPEG needs it). */
const THUMBNAIL_WIDTH = 640;
/**
 * ffmpeg's MJPEG quality scale runs 2 (best) to 31. 4 lands around libjpeg
 * quality 82 — sharp at card size, a few tens of KB per thumbnail.
 */
const THUMBNAIL_QSCALE = 4;

type RunResult = { exitCode: number | null; stdout: string };

function run(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<RunResult | null> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";

    const finish = (result: RunResult | null) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(binary, args, { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolve(null);
      return;
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null);
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", () => finish(null));
    child.on("close", (exitCode) => finish({ exitCode, stdout }));
  });
}

/**
 * Duration in seconds, or `null` when it cannot be determined.
 *
 * Reads the container header first. Some files have no duration there — WebM
 * written by a browser's MediaRecorder, which is what most in-browser screen
 * recorders produce — so when the header says `N/A` it falls back to scanning
 * the packets.
 */
export async function probeDuration(filePath: string): Promise<number | null> {
  return (
    (await durationFromHeader(filePath)) ?? (await durationFromPackets(filePath))
  );
}

async function durationFromHeader(filePath: string): Promise<number | null> {
  const result = await run(
    ffprobe.path,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    PROBE_TIMEOUT_MS,
  );

  if (!result || result.exitCode !== 0) {
    return null;
  }

  return nonNegative(Number.parseFloat(result.stdout.trim()));
}

/**
 * Remuxes every packet to nowhere (`-c copy -f null`) — no decoding, so it is
 * bound by disk speed — and reads the final timestamp ffmpeg reports.
 */
async function durationFromPackets(filePath: string): Promise<number | null> {
  const result = await run(
    ffmpeg.path,
    [
      "-v",
      "error",
      "-nostdin",
      "-i",
      filePath,
      "-map",
      "0",
      "-c",
      "copy",
      "-f",
      "null",
      "-",
      "-progress",
      "pipe:1",
    ],
    PACKET_SCAN_TIMEOUT_MS,
  );

  if (!result || result.exitCode !== 0) {
    return null;
  }

  const lastTime = [...result.stdout.matchAll(/^out_time_us=(\d+)$/gm)].at(-1);
  const seconds = lastTime ? Number(lastTime[1]) / 1_000_000 : Number.NaN;

  // Zero means ffmpeg found no timed packets — not a usable duration.
  return seconds > 0 ? seconds : null;
}

function nonNegative(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Where to grab the thumbnail frame: ~10% in, capped at 60 s, and the very
 * first frame when the duration is unknown or under a second.
 */
export function thumbnailOffsetSeconds(duration: number | null): number {
  if (duration === null || duration < 1) {
    return 0;
  }

  return Math.min(duration * THUMBNAIL_POSITION, MAX_THUMBNAIL_OFFSET_SECONDS);
}

/**
 * Writes one JPEG frame from `source` to `destination`. Resolves `true` only
 * when a non-empty file was produced; otherwise removes any partial output and
 * resolves `false`.
 */
export async function extractThumbnail({
  source,
  destination,
  atSeconds,
}: {
  source: string;
  destination: string;
  atSeconds: number;
}): Promise<boolean> {
  const result = await run(
    ffmpeg.path,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      // `-ss` before `-i` seeks on the input: fast, and exact enough for a frame.
      "-ss",
      atSeconds.toFixed(3),
      "-i",
      source,
      "-frames:v",
      "1",
      "-vf",
      `scale=${THUMBNAIL_WIDTH}:-2`,
      "-q:v",
      String(THUMBNAIL_QSCALE),
      destination,
    ],
    THUMBNAIL_TIMEOUT_MS,
  );

  if (result?.exitCode === 0) {
    const size = await stat(destination).then(
      (info) => info.size,
      () => 0,
    );

    if (size > 0) {
      return true;
    }
  }

  await removeFileQuietly(destination);

  return false;
}
