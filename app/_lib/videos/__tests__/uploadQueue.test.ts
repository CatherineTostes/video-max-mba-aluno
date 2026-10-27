import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VideoDTO } from "../dto";
import { UploadClientError, type UploadFileOptions } from "../uploadClient";
import { UploadQueue, type UploadItem } from "../uploadQueue";

/**
 * A transport whose transfers stay open until the test settles them, so each
 * state of the queue can be observed in turn.
 */
function controllableTransport() {
  const calls: Array<{
    options: UploadFileOptions;
    resolve: (video: VideoDTO) => void;
    reject: (error: unknown) => void;
  }> = [];

  const transport = vi.fn(
    (options: UploadFileOptions) =>
      new Promise<VideoDTO>((resolve, reject) => {
        options.signal?.addEventListener("abort", () =>
          reject(new DOMException("Upload cancelled", "AbortError")),
        );
        calls.push({ options, resolve, reject });
      }),
  );

  return { transport, calls };
}

function video(id: string): VideoDTO {
  return {
    id,
    title: id,
    description: "",
    originalFilename: `${id}.mp4`,
    sizeBytes: 100,
    durationSeconds: 1,
    containerFormat: "mp4",
    status: "validating",
    thumbnailUrl: `/api/videos/${id}/thumbnail`,
    hasCustomThumbnail: true,
    createdAt: "2026-10-21T00:00:00.000Z",
  };
}

const file = (name: string, size = 100) =>
  new File([new Uint8Array(size)], name, { type: "video/mp4" });

/** Lets queued promise callbacks (the queue's own `.then`s) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function statusOf(queue: UploadQueue, id: string) {
  return queue.getSnapshot().find((item) => item.id === id)?.status;
}

let counter: number;
const createId = () => `item-${(counter += 1)}`;

beforeEach(() => {
  counter = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("UploadQueue", () => {
  it("starts the first item immediately", () => {
    const { transport } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });

    const [id] = queue.enqueue([file("a.mp4")]);

    expect(statusOf(queue, id!)).toBe("uploading");
    expect(transport).toHaveBeenCalledOnce();
  });

  it("runs one upload at a time, starting the next when the first finishes", async () => {
    const { transport, calls } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });

    const [first, second] = queue.enqueue([file("a.mp4"), file("b.mp4")]);

    expect(statusOf(queue, first!)).toBe("uploading");
    expect(statusOf(queue, second!)).toBe("queued");
    expect(transport).toHaveBeenCalledOnce();

    calls[0]!.resolve(video("a"));
    await settle();

    expect(statusOf(queue, first!)).toBe("done");
    expect(statusOf(queue, second!)).toBe("uploading");
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("queues a file added while another is in flight", () => {
    const { transport } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });

    queue.enqueue([file("a.mp4")]);
    const [late] = queue.enqueue([file("b.mp4")]);

    expect(statusOf(queue, late!)).toBe("queued");
    expect(transport).toHaveBeenCalledOnce();
  });

  it("tracks progress and flips to processing once every byte is sent", () => {
    const { transport, calls } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    const [id] = queue.enqueue([file("a.mp4", 1000)]);

    calls[0]!.options.onProgress?.({ loaded: 250, total: 1000 });

    expect(queue.getSnapshot()[0]).toMatchObject({
      loadedBytes: 250,
      totalBytes: 1000,
      status: "uploading",
    });

    calls[0]!.options.onProgress?.({ loaded: 1000, total: 1000 });

    expect(statusOf(queue, id!)).toBe("processing");
  });

  it("stores the created video on success", async () => {
    const { transport, calls } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    queue.enqueue([file("a.mp4")]);

    calls[0]!.resolve(video("server-id"));
    await settle();

    expect(queue.getSnapshot()[0]?.video?.id).toBe("server-id");
  });

  it("cancelling the in-flight item aborts it and advances the queue", async () => {
    const { transport, calls } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    const [first, second] = queue.enqueue([file("a.mp4"), file("b.mp4")]);

    queue.cancel(first!);
    await settle();

    expect(calls[0]!.options.signal?.aborted).toBe(true);
    expect(statusOf(queue, first!)).toBe("cancelled");
    expect(statusOf(queue, second!)).toBe("uploading");
  });

  it("cancelling a waiting item takes it out of line without touching the active one", () => {
    const { transport } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    const [first, second] = queue.enqueue([file("a.mp4"), file("b.mp4")]);

    queue.cancel(second!);

    expect(statusOf(queue, first!)).toBe("uploading");
    expect(statusOf(queue, second!)).toBe("cancelled");
    expect(transport).toHaveBeenCalledOnce();
  });

  it("marks a failed upload with its code and message, then moves on", async () => {
    const { transport, calls } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    const [first, second] = queue.enqueue([file("a.mp4"), file("b.mp4")]);

    calls[0]!.reject(new UploadClientError("UPL_INCOMPLETE"));
    await settle();

    expect(queue.getSnapshot().find((i) => i.id === first)).toMatchObject({
      status: "failed",
      error: { code: "UPL_INCOMPLETE", message: "Upload interrupted — retry" },
    });
    expect(statusOf(queue, second!)).toBe("uploading");
  });

  it("treats an unexpected error as a generic upload failure", async () => {
    const { transport, calls } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    const [id] = queue.enqueue([file("a.mp4")]);

    calls[0]!.reject(new Error("boom"));
    await settle();

    expect(queue.getSnapshot().find((i) => i.id === id)?.error?.code).toBe(
      "UPL_DISK_WRITE",
    );
  });

  it("retries a failed item from zero", async () => {
    const { transport, calls } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    const [id] = queue.enqueue([file("a.mp4", 1000)]);
    calls[0]!.options.onProgress?.({ loaded: 600, total: 1000 });
    calls[0]!.reject(new UploadClientError("UPL_INCOMPLETE"));
    await settle();

    queue.retry(id!);

    expect(queue.getSnapshot().find((i) => i.id === id)).toMatchObject({
      status: "uploading",
      loadedBytes: 0,
      error: undefined,
    });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(calls[1]!.options.file.name).toBe("a.mp4");
  });

  it("ignores retry on an item that has not failed", () => {
    const { transport } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    const [id] = queue.enqueue([file("a.mp4")]);

    queue.retry(id!);

    expect(transport).toHaveBeenCalledOnce();
  });

  it("notifies subscribers with a new snapshot on every change", async () => {
    const { transport, calls } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    const snapshots: (readonly UploadItem[])[] = [];
    const unsubscribe = queue.subscribe((snapshot) => snapshots.push(snapshot));

    queue.enqueue([file("a.mp4", 10)]);
    calls[0]!.options.onProgress?.({ loaded: 5, total: 10 });
    calls[0]!.resolve(video("a"));
    await settle();

    expect(snapshots.map((s) => s[0]?.status)).toEqual([
      "queued",
      "uploading",
      "uploading",
      "done",
    ]);
    // Each snapshot is a fresh array, so React sees every change.
    expect(new Set(snapshots).size).toBe(snapshots.length);
    expect(snapshots.at(-1)).toBe(queue.getSnapshot());

    unsubscribe();
    queue.enqueue([file("b.mp4")]);
    expect(snapshots).toHaveLength(4);
  });

  it("removes done and cancelled cards on their own after a few seconds", async () => {
    vi.useFakeTimers();
    const { transport, calls } = controllableTransport();
    const queue = new UploadQueue({ transport, createId, finishedTtlMs: 5000 });
    const [done, cancelled] = queue.enqueue([file("a.mp4"), file("b.mp4")]);
    queue.cancel(cancelled!);
    calls[0]!.resolve(video("a"));
    await vi.advanceTimersByTimeAsync(0);

    expect(statusOf(queue, done!)).toBe("done");

    await vi.advanceTimersByTimeAsync(5000);

    expect(queue.getSnapshot()).toEqual([]);
  });

  it("keeps failed cards until they are dismissed", async () => {
    vi.useFakeTimers();
    const { transport, calls } = controllableTransport();
    const queue = new UploadQueue({ transport, createId, finishedTtlMs: 5000 });
    const [id] = queue.enqueue([file("a.mp4")]);
    calls[0]!.reject(new UploadClientError("UPL_DISK_WRITE"));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(statusOf(queue, id!)).toBe("failed");

    queue.dismiss(id!);

    expect(queue.getSnapshot()).toEqual([]);
  });

  it("refuses to dismiss an upload that is still running", () => {
    const { transport } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    const [active, waiting] = queue.enqueue([file("a.mp4"), file("b.mp4")]);

    queue.dismiss(active!);
    queue.dismiss(waiting!);

    expect(queue.getSnapshot()).toHaveLength(2);
  });

  it("returns no ids and emits nothing for an empty batch", () => {
    const { transport } = controllableTransport();
    const queue = new UploadQueue({ transport, createId });
    const listener = vi.fn();
    queue.subscribe(listener);

    expect(queue.enqueue([])).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });
});
