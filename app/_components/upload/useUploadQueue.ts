"use client";

import { useSyncExternalStore } from "react";

import {
  getServerUploadSnapshot,
  uploadQueue,
  type UploadQueue,
} from "@/app/_lib/videos/uploadQueue";

/**
 * React view of the app-wide upload queue.
 *
 * Every component calling this sees the same items, and the uploads belong to
 * the queue rather than to any component — unmounting the drop zone (say, by
 * navigating away) does not interrupt a transfer.
 */
export function useUploadQueue(queue: UploadQueue = uploadQueue) {
  const items = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    getServerUploadSnapshot,
  );

  return {
    items,
    enqueue: queue.enqueue,
    cancel: queue.cancel,
    retry: queue.retry,
    dismiss: queue.dismiss,
  };
}
