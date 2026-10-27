// @vitest-environment node
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the ffprobe/ffmpeg wrappers with `child_process.spawn`
 * replaced by a scripted fake. The real binaries are exercised once, against a
 * fixture, in probe.integration.test.ts.
 */

type Script = {
  stdout?: string;
  exitCode?: number | null;
  /** Emit an "error" event instead of exiting (binary missing, EACCES…). */
  spawnError?: boolean;
  /** Never exit, so the wrapper's timeout has to kill it. */
  hang?: boolean;
  /** Side effect to run before exiting, such as writing the output file. */
  onRun?: (args: string[]) => Promise<void> | void;
};

const { spawnMock, statMock, rmMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  statMock: vi.fn(),
  rmMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  stat: statMock,
  rm: rmMock,
}));
vi.mock("@ffmpeg-installer/ffmpeg", () => ({ default: { path: "/bin/ffmpeg" } }));
vi.mock("@ffprobe-installer/ffprobe", () => ({
  default: { path: "/bin/ffprobe" },
}));

const { extractThumbnail, probeDuration, thumbnailOffsetSeconds } =
  await import("../probe");

/** One behaviour for every spawn, or one per binary. */
function script(plan: Script | ((binary: string) => Script)) {
  spawnMock.mockImplementation((binary: string, args: string[]) => {
    const behaviour = typeof plan === "function" ? plan(binary) : plan;
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new PassThrough();
    child.kill = vi.fn(() => {
      child.emit("close", null);
    });

    queueMicrotask(async () => {
      if (behaviour.spawnError) {
        child.emit("error", new Error("ENOENT"));
        return;
      }

      if (behaviour.hang) {
        return;
      }

      await behaviour.onRun?.(args);
      child.stdout.end(behaviour.stdout ?? "");
      // Let the stdout data drain before "close", as Node does.
      setImmediate(() => child.emit("close", behaviour.exitCode ?? 0));
    });

    return child;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rmMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("probeDuration", () => {
  it("returns the duration ffprobe prints", async () => {
    script({ stdout: "1823.400000\n" });

    await expect(probeDuration("/videos/a.mp4")).resolves.toBe(1823.4);
    expect(spawnMock).toHaveBeenCalledWith(
      "/bin/ffprobe",
      expect.arrayContaining(["-show_entries", "format=duration", "/videos/a.mp4"]),
      expect.anything(),
    );
  });

  it("returns null on a non-zero exit", async () => {
    script({ stdout: "", exitCode: 1 });

    await expect(probeDuration("/videos/a.mp4")).resolves.toBeNull();
  });

  it("returns null when ffprobe prints something that is not a number", async () => {
    script({ stdout: "N/A\n" });

    await expect(probeDuration("/videos/a.mp4")).resolves.toBeNull();
  });

  it("returns null when the binary cannot be started", async () => {
    script({ spawnError: true });

    await expect(probeDuration("/videos/a.mp4")).resolves.toBeNull();
  });

  it("kills a hung ffprobe, then a hung fallback, and returns null", async () => {
    vi.useFakeTimers();
    script({ hang: true });

    const result = probeDuration("/videos/a.mp4");
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(120_000);

    await expect(result).resolves.toBeNull();
    expect(spawnMock.mock.results[0]?.value.kill).toHaveBeenCalledWith("SIGKILL");
    expect(spawnMock.mock.results[1]?.value.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("does not run the packet scan when the header has a duration", async () => {
    script({ stdout: "12.5\n" });

    await probeDuration("/videos/a.mp4");

    expect(spawnMock).toHaveBeenCalledOnce();
  });

  it("falls back to scanning packets when the header has no duration", async () => {
    script((binary) =>
      binary === "/bin/ffprobe"
        ? { stdout: "N/A\n" }
        : {
            stdout:
              "out_time_us=1000000\nprogress=continue\nout_time_us=2926000\nprogress=end\n",
          },
    );

    await expect(probeDuration("/videos/a.webm")).resolves.toBe(2.926);
    expect(spawnMock).toHaveBeenLastCalledWith(
      "/bin/ffmpeg",
      expect.arrayContaining(["-i", "/videos/a.webm", "-c", "copy", "-f", "null"]),
      expect.anything(),
    );
  });

  it("returns null when the packet scan finds no timed packets", async () => {
    script((binary) =>
      binary === "/bin/ffprobe"
        ? { stdout: "N/A\n" }
        : { stdout: "out_time_us=0\nprogress=end\n" },
    );

    await expect(probeDuration("/videos/a.webm")).resolves.toBeNull();
  });
});

describe("thumbnailOffsetSeconds", () => {
  it("grabs the frame 10% in", () => {
    expect(thumbnailOffsetSeconds(120)).toBe(12);
  });

  it("never seeks past 60 seconds", () => {
    expect(thumbnailOffsetSeconds(7200)).toBe(60);
  });

  it("uses the first frame for very short or unknown durations", () => {
    expect(thumbnailOffsetSeconds(0.5)).toBe(0);
    expect(thumbnailOffsetSeconds(null)).toBe(0);
  });
});

describe("extractThumbnail", () => {
  const request = {
    source: "/videos/a.mp4",
    destination: "/videos/thumbnail.jpg",
    atSeconds: 12,
  };

  it("resolves true when ffmpeg writes a non-empty JPEG", async () => {
    script({ exitCode: 0 });
    statMock.mockResolvedValue({ size: 2048 });

    await expect(extractThumbnail(request)).resolves.toBe(true);

    const args = spawnMock.mock.calls[0]?.[1] as string[];
    expect(spawnMock.mock.calls[0]?.[0]).toBe("/bin/ffmpeg");
    expect(args).toEqual(
      expect.arrayContaining(["-ss", "12.000", "-i", "/videos/a.mp4", "-frames:v", "1"]),
    );
    expect(args.at(-1)).toBe("/videos/thumbnail.jpg");
    expect(args).toContain("scale=640:-2");
  });

  it("resolves false and removes the output on a non-zero exit", async () => {
    script({ exitCode: 1 });

    await expect(extractThumbnail(request)).resolves.toBe(false);
    expect(rmMock).toHaveBeenCalledWith("/videos/thumbnail.jpg", { force: true });
  });

  it("resolves false when ffmpeg exits cleanly but writes nothing", async () => {
    script({ exitCode: 0 });
    statMock.mockResolvedValue({ size: 0 });

    await expect(extractThumbnail(request)).resolves.toBe(false);
  });

  it("resolves false when the binary cannot be started", async () => {
    script({ spawnError: true });

    await expect(extractThumbnail(request)).resolves.toBe(false);
  });

  it("kills a hung ffmpeg and resolves false", async () => {
    vi.useFakeTimers();
    script({ hang: true });

    const result = extractThumbnail(request);
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(result).resolves.toBe(false);
  });
});
