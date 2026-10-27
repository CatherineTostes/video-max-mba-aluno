import type { VideoDTO } from "@/app/_lib/videos/dto";
import {
  UPLOAD_ERROR_MESSAGES,
  type UploadErrorCode,
} from "@/app/_lib/videos/errors";
import {
  isAbortError,
  UploadClientError,
  uploadVideoFile,
  type UploadFileOptions,
} from "@/app/_lib/videos/uploadClient";

/**
 * The browser's upload queue: one file in flight at a time, the rest waiting.
 *
 * Framework-free on purpose. The app uses one module-level instance
 * (`uploadQueue`, below), so a transfer keeps going when the component that
 * started it unmounts — navigating away from the library does not kill an
 * upload. React reads it through `useUploadQueue` (`useSyncExternalStore`).
 *
 * Every change replaces the items array, so a snapshot is safe to hold on to
 * and cheap to compare.
 */

export type UploadItemStatus =
  | "queued"
  | "uploading"
  /** Every byte is sent; the server is probing and extracting the thumbnail. */
  | "processing"
  | "done"
  | "failed"
  | "cancelled";

export type UploadItem = Readonly<{
  /** Client-side id, so the card exists before the server row does. */
  id: string;
  fileName: string;
  totalBytes: number;
  loadedBytes: number;
  status: UploadItemStatus;
  error?: Readonly<{ code: UploadErrorCode; message: string }>;
  /** The created video, once the server answered 201. */
  video?: VideoDTO;
}>;

export type UploadTransport = (options: UploadFileOptions) => Promise<VideoDTO>;

export type UploadQueueOptions = {
  transport: UploadTransport;
  /** How long done and cancelled cards linger before removing themselves. */
  finishedTtlMs?: number;
  createId?: () => string;
};

type Listener = (snapshot: readonly UploadItem[]) => void;

const DEFAULT_FINISHED_TTL_MS = 5_000;

/** Items that still have work ahead of them. */
const ACTIVE_STATUSES: readonly UploadItemStatus[] = [
  "queued",
  "uploading",
  "processing",
];

export function isActiveUpload(item: UploadItem): boolean {
  return ACTIVE_STATUSES.includes(item.status);
}

export class UploadQueue {
  readonly #transport: UploadTransport;
  readonly #finishedTtlMs: number;
  readonly #createId: () => string;

  #items: readonly UploadItem[] = [];
  readonly #files = new Map<string, File>();
  readonly #listeners = new Set<Listener>();
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  #active: { id: string; controller: AbortController } | null = null;

  constructor({
    transport,
    finishedTtlMs = DEFAULT_FINISHED_TTL_MS,
    createId = () => crypto.randomUUID(),
  }: UploadQueueOptions) {
    this.#transport = transport;
    this.#finishedTtlMs = finishedTtlMs;
    this.#createId = createId;
  }

  /** Arrow properties so they can be handed to React without binding. */
  getSnapshot = (): readonly UploadItem[] => this.#items;

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Adds files to the back of the queue and returns their ids. */
  enqueue = (files: readonly File[]): string[] => {
    const added: UploadItem[] = files.map((file) => {
      const id = this.#createId();
      this.#files.set(id, file);

      return {
        id,
        fileName: file.name,
        totalBytes: file.size,
        loadedBytes: 0,
        status: "queued",
      };
    });

    if (added.length > 0) {
      this.#setItems([...this.#items, ...added]);
      this.#pump();
    }

    return added.map((item) => item.id);
  };

  /** Stops the in-flight transfer, or pulls a waiting item out of line. */
  cancel = (id: string): void => {
    const item = this.#find(id);

    if (!item) {
      return;
    }

    if (this.#active?.id === id) {
      // The transport rejects with an AbortError; #run marks it cancelled.
      this.#active.controller.abort();
      return;
    }

    if (item.status === "queued") {
      this.#update(id, { status: "cancelled" });
      this.#finish(id);
    }
  };

  /** Re-runs a failed upload from byte zero, at the back of the queue. */
  retry = (id: string): void => {
    const item = this.#find(id);

    if (!item || item.status !== "failed" || !this.#files.has(id)) {
      return;
    }

    this.#setItems([
      ...this.#items.filter((other) => other.id !== id),
      { ...item, status: "queued", loadedBytes: 0, error: undefined },
    ]);
    this.#pump();
  };

  /** Removes a finished card. In-flight and waiting items cannot be dismissed. */
  dismiss = (id: string): void => {
    const item = this.#find(id);

    if (!item || ACTIVE_STATUSES.includes(item.status)) {
      return;
    }

    this.#remove(id);
  };

  #pump(): void {
    if (this.#active) {
      return;
    }

    const next = this.#items.find((item) => item.status === "queued");

    if (next) {
      void this.#run(next.id);
    }
  }

  async #run(id: string): Promise<void> {
    const file = this.#files.get(id);

    if (!file) {
      return;
    }

    const controller = new AbortController();
    this.#active = { id, controller };
    this.#update(id, { status: "uploading", loadedBytes: 0 });

    try {
      const video = await this.#transport({
        file,
        signal: controller.signal,
        onProgress: ({ loaded, total }) => {
          this.#update(id, {
            loadedBytes: Math.min(loaded, total),
            totalBytes: total,
            status: loaded >= total ? "processing" : "uploading",
          });
        },
      });

      this.#files.delete(id);
      this.#update(id, { status: "done", loadedBytes: file.size, video });
      this.#finish(id);
    } catch (error) {
      if (isAbortError(error)) {
        this.#update(id, { status: "cancelled" });
        this.#finish(id);
      } else {
        const code =
          error instanceof UploadClientError ? error.code : "UPL_DISK_WRITE";

        this.#update(id, {
          status: "failed",
          error: { code, message: UPLOAD_ERROR_MESSAGES[code] },
        });
      }
    } finally {
      this.#active = null;
      this.#pump();
    }
  }

  /** Schedules a done/cancelled card to disappear on its own. */
  #finish(id: string): void {
    if (this.#status(id) === "cancelled") {
      this.#files.delete(id);
    }

    this.#timers.set(
      id,
      setTimeout(() => this.#remove(id), this.#finishedTtlMs),
    );
  }

  #remove(id: string): void {
    clearTimeout(this.#timers.get(id));
    this.#timers.delete(id);
    this.#files.delete(id);

    if (this.#find(id)) {
      this.#setItems(this.#items.filter((item) => item.id !== id));
    }
  }

  #find(id: string): UploadItem | undefined {
    return this.#items.find((item) => item.id === id);
  }

  #status(id: string): UploadItemStatus | undefined {
    return this.#find(id)?.status;
  }

  #update(id: string, patch: Partial<UploadItem>): void {
    this.#setItems(
      this.#items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  #setItems(items: readonly UploadItem[]): void {
    this.#items = items;

    for (const listener of this.#listeners) {
      listener(items);
    }
  }
}

/** The app-wide queue. One per tab; lives as long as the page does. */
export const uploadQueue = new UploadQueue({ transport: uploadVideoFile });

const EMPTY: readonly UploadItem[] = [];

/** Server render has no uploads; a stable empty array keeps React happy. */
export function getServerUploadSnapshot(): readonly UploadItem[] {
  return EMPTY;
}
