// @vitest-environment node
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getMaxVideoBytes, getVideoStorageRoot } from "../config";
import {
  ALLOWED_EXTENSIONS,
  allowedExtensionOf,
  DEFAULT_MAX_VIDEO_BYTES,
  FILE_INPUT_ACCEPT,
  titleFromFilename,
} from "../constants";

afterEach(() => {
  delete process.env.VIDEO_STORAGE_ROOT;
  delete process.env.VIDEO_MAX_BYTES;
});

describe("upload constants", () => {
  it("caps uploads at 2 GiB", () => {
    expect(DEFAULT_MAX_VIDEO_BYTES).toBe(2_147_483_648);
  });

  it("accepts exactly the five PRD formats", () => {
    expect(ALLOWED_EXTENSIONS).toEqual(["mp4", "mov", "mkv", "webm", "avi"]);
  });

  it("builds the file picker accept attribute from the extensions", () => {
    expect(FILE_INPUT_ACCEPT).toBe(".mp4,.mov,.mkv,.webm,.avi");
  });
});

describe("allowedExtensionOf", () => {
  it.each([
    ["clip.mp4", "mp4"],
    ["CLIP.MOV", "mov"],
    ["my.holiday.mkv", "mkv"],
    ["a.WebM", "webm"],
    ["old.avi", "avi"],
  ])("returns the lowercased extension of %s", (name, expected) => {
    expect(allowedExtensionOf(name)).toBe(expected);
  });

  it.each(["clip.mpg", "clip", ".mp4", "clip.", "clip.mp4.exe"])(
    "rejects %s",
    (name) => {
      expect(allowedExtensionOf(name)).toBeNull();
    },
  );
});

describe("titleFromFilename", () => {
  it("drops the extension", () => {
    expect(titleFromFilename("morning-standup.mp4")).toBe("morning-standup");
  });

  it("keeps inner dots", () => {
    expect(titleFromFilename("v1.2 release.mov")).toBe("v1.2 release");
  });

  it("trims whitespace and caps the length at 200", () => {
    const title = titleFromFilename(`   ${"x".repeat(500)}   .mp4`);

    expect(title).toHaveLength(200);
    expect(title.startsWith("x")).toBe(true);
  });
});

describe("getVideoStorageRoot", () => {
  it("defaults to storage/videos under the project root", () => {
    expect(getVideoStorageRoot()).toBe(
      path.resolve(process.cwd(), "storage/videos"),
    );
  });

  it("resolves a relative override against the project root", () => {
    process.env.VIDEO_STORAGE_ROOT = "tmp/uploads";

    expect(getVideoStorageRoot()).toBe(path.resolve(process.cwd(), "tmp/uploads"));
  });

  it("keeps an absolute override as-is", () => {
    process.env.VIDEO_STORAGE_ROOT = "/var/videomax";

    expect(getVideoStorageRoot()).toBe("/var/videomax");
  });
});

describe("getMaxVideoBytes", () => {
  it("defaults to 2 GiB", () => {
    expect(getMaxVideoBytes()).toBe(DEFAULT_MAX_VIDEO_BYTES);
  });

  it("honours a positive integer override", () => {
    process.env.VIDEO_MAX_BYTES = "1000";

    expect(getMaxVideoBytes()).toBe(1000);
  });

  it.each(["", "abc", "-5", "0", "1.5"])(
    "falls back to the default for %j",
    (value) => {
      process.env.VIDEO_MAX_BYTES = value;

      expect(getMaxVideoBytes()).toBe(DEFAULT_MAX_VIDEO_BYTES);
    },
  );
});
