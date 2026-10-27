import { describe, expect, it } from "vitest";

import { isVideoStatus, VIDEO_STATUSES, VideoStatus } from "../status";

describe("VideoStatus", () => {
  it("lists the five pipeline statuses in pipeline order", () => {
    expect(VIDEO_STATUSES).toEqual([
      "validating",
      "transcribing",
      "summarizing",
      "ready",
      "failed",
    ]);
  });

  it("names every status exactly once", () => {
    expect(Object.values(VideoStatus).sort()).toEqual(
      [...VIDEO_STATUSES].sort(),
    );
  });

  it.each(VIDEO_STATUSES)("recognises %s", (status) => {
    expect(isVideoStatus(status)).toBe(true);
  });

  it.each(["", "VALIDATING", "processing", null, undefined, 3])(
    "rejects %s",
    (value) => {
      expect(isVideoStatus(value)).toBe(false);
    },
  );
});
