"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { isActiveUpload } from "@/app/_lib/videos/uploadQueue";
import { UploadProgressCard } from "./UploadProgressCard";
import { useUploadQueue } from "./useUploadQueue";

/**
 * Cards for every upload the queue knows about: the one in flight, the ones
 * waiting, and recently finished or failed ones.
 *
 * When an upload completes it asks the router to refresh, so the server-
 * rendered video list picks up the new row without a full reload.
 */
export function UploadProgressList() {
  const { items, cancel, retry, dismiss } = useUploadQueue();
  const router = useRouter();
  const refreshedIds = useRef(new Set<string>());
  const hasActiveUpload = items.some(isActiveUpload);

  useEffect(() => {
    const newlyDone = items.filter(
      (item) => item.status === "done" && !refreshedIds.current.has(item.id),
    );

    if (newlyDone.length > 0) {
      for (const item of newlyDone) {
        refreshedIds.current.add(item.id);
      }

      router.refresh();
    }
  }, [items, router]);

  // Closing the tab mid-transfer throws the upload away; ask first.
  useEffect(() => {
    if (!hasActiveUpload) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [hasActiveUpload]);

  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-label="Uploads" className="mt-6">
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <UploadProgressCard
              item={item}
              onCancel={cancel}
              onRetry={retry}
              onDismiss={dismiss}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
