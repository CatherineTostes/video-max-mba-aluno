import { describe, expect, it } from "vitest";

import { formatBytes, formatDuration, percentOf } from "../format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1536, "1.5 KB"],
    [250 * 1024 * 1024, "250 MB"],
    [2 * 1024 * 1024 * 1024, "2.0 GB"],
  ])("formats %d as %s", (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});

describe("percentOf", () => {
  it("rounds down, so 100% only shows when every byte is sent", () => {
    expect(percentOf(999, 1000)).toBe(99);
    expect(percentOf(1000, 1000)).toBe(100);
  });

  it("treats an empty total as 0%", () => {
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0:00"],
    [65.4, "1:05"],
    [3725, "1:02:05"],
  ])("formats %d seconds as %s", (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});
