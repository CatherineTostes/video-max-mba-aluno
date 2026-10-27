import { describe, expect, it } from "vitest";

import { validateClientFile } from "../clientValidation";
import { DEFAULT_MAX_VIDEO_BYTES } from "../constants";

const MB = 1024 * 1024;

/** Only name and size matter, so skip allocating real 2 GB blobs. */
const file = (name: string, size: number) => ({ name, size });

describe("validateClientFile", () => {
  it("accepts an MP4 under the limit", () => {
    expect(validateClientFile(file("x.mp4", MB))).toEqual({ ok: true });
  });

  it.each(["x.mov", "x.mkv", "x.webm", "x.avi"])("accepts %s", (name) => {
    expect(validateClientFile(file(name, MB))).toEqual({ ok: true });
  });

  it("matches the extension case-insensitively", () => {
    expect(validateClientFile(file("x.MP4", MB))).toEqual({ ok: true });
  });

  it("accepts a file of exactly 2 GiB", () => {
    expect(
      validateClientFile(file("x.mp4", DEFAULT_MAX_VIDEO_BYTES)),
    ).toEqual({ ok: true });
  });

  it("rejects an unknown extension with the PRD message", () => {
    expect(validateClientFile(file("x.mpg", MB))).toEqual({
      ok: false,
      reason: "UPL_BAD_EXTENSION",
      message: "Only MP4, MOV, MKV, WEBM, and AVI files are supported",
    });
  });

  it("rejects a file one byte over 2 GiB with the PRD message", () => {
    expect(
      validateClientFile(file("x.mp4", DEFAULT_MAX_VIDEO_BYTES + 1)),
    ).toEqual({
      ok: false,
      reason: "UPL_TOO_LARGE",
      message: "Files must be at most 2GB",
    });
  });

  it("rejects an empty file", () => {
    expect(validateClientFile(file("x.mp4", 0))).toMatchObject({
      ok: false,
      reason: "UPL_EMPTY",
    });
  });

  it("reports the extension problem first when both rules fail", () => {
    expect(
      validateClientFile(file("x.mpg", DEFAULT_MAX_VIDEO_BYTES + 1)),
    ).toMatchObject({ reason: "UPL_BAD_EXTENSION" });
  });
});
