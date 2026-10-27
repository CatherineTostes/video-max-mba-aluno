import { existsSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { extractThumbnail, probeDuration } from "../probe";

/**
 * The real bundled binaries against a committed 2-second fixture — proof that
 * the npm-installed ffprobe/ffmpeg actually run on this platform.
 */

const FIXTURE = path.resolve("tests/fixtures/tiny.mp4");
/** Written through a pipe, so — like MediaRecorder output — no header duration. */
const NO_HEADER_DURATION = path.resolve("tests/fixtures/no-duration.webm");

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "videomax-probe-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("probe (real binaries)", () => {
  it("reads the fixture's duration", async () => {
    const duration = await probeDuration(FIXTURE);

    expect(duration).toBeCloseTo(2, 1);
  });

  it("recovers the duration of a WebM whose header has none", async () => {
    const duration = await probeDuration(NO_HEADER_DURATION);

    expect(duration).toBeCloseTo(2, 0);
  });

  it("extracts a JPEG thumbnail from the fixture", async () => {
    const destination = path.join(workDir, "thumbnail.jpg");

    await expect(
      extractThumbnail({ source: FIXTURE, destination, atSeconds: 0.2 }),
    ).resolves.toBe(true);
    expect((await stat(destination)).size).toBeGreaterThan(0);
  });

  it("returns null and false for a file that is not a video", async () => {
    const notAVideo = path.resolve("package.json");
    const destination = path.join(workDir, "thumbnail.jpg");

    await expect(probeDuration(notAVideo)).resolves.toBeNull();
    await expect(
      extractThumbnail({ source: notAVideo, destination, atSeconds: 0 }),
    ).resolves.toBe(false);
    expect(existsSync(destination)).toBe(false);
  });
});
