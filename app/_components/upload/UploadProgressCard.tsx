import { formatBytes, percentOf } from "@/app/_lib/videos/format";
import type { UploadItem } from "@/app/_lib/videos/uploadQueue";

type UploadProgressCardProps = {
  item: UploadItem;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
};

const actionButton =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * One file's upload: name, bytes sent of total, percentage, and whatever the
 * user can do about it right now. Purely presentational — the queue owns state.
 */
export function UploadProgressCard({
  item,
  onCancel,
  onRetry,
  onDismiss,
}: UploadProgressCardProps) {
  const percent =
    item.status === "processing" || item.status === "done"
      ? 100
      : percentOf(item.loadedBytes, item.totalBytes);
  const showBar = item.status === "uploading" || item.status === "processing";
  const canCancel = item.status === "queued" || item.status === "uploading";
  const isFailed = item.status === "failed";

  return (
    <article
      aria-label={`Upload of ${item.fileName}`}
      data-status={item.status}
      className="flex items-center gap-4 rounded-lg border border-outline bg-background p-4"
    >
      <Thumbnail item={item} />

      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium text-foreground"
          title={item.fileName}
        >
          {item.fileName}
        </p>

        <p
          className={`mt-1 text-sm ${isFailed ? "text-red-600" : "text-muted"}`}
          aria-live={isFailed ? "assertive" : "polite"}
        >
          <StatusLine item={item} percent={percent} />
        </p>

        {showBar ? (
          <div
            role="progressbar"
            aria-label={`Uploading ${item.fileName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-outline"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {canCancel ? (
          <button
            type="button"
            onClick={() => onCancel(item.id)}
            className={`${actionButton} text-muted hover:text-foreground`}
          >
            Cancel
          </button>
        ) : null}

        {isFailed ? (
          <button
            type="button"
            onClick={() => onRetry(item.id)}
            className={`${actionButton} text-accent hover:text-accent-hover`}
          >
            Retry
          </button>
        ) : null}

        {isFailed || item.status === "cancelled" ? (
          <button
            type="button"
            onClick={() => onDismiss(item.id)}
            className={`${actionButton} text-muted hover:text-foreground`}
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </article>
  );
}

function StatusLine({ item, percent }: { item: UploadItem; percent: number }) {
  const total = formatBytes(item.totalBytes);

  switch (item.status) {
    case "queued":
      return <>Waiting to upload · {total}</>;
    case "uploading":
      return (
        <>
          {formatBytes(item.loadedBytes)} of {total} · {percent}%
        </>
      );
    case "processing":
      return <>{total} uploaded · generating thumbnail…</>;
    case "done":
      return (
        <span className="text-emerald-700">
          <span aria-hidden="true">✓ </span>Uploaded · {total}
        </span>
      );
    case "cancelled":
      return <>Cancelled</>;
    case "failed":
      return <>{item.error?.message ?? "Upload failed — please try again"}</>;
  }
}

function Thumbnail({ item }: { item: UploadItem }) {
  if (item.status === "done" && item.video) {
    return (
      // A plain <img>: the thumbnail is behind the session cookie, which the
      // next/image optimizer would not forward when it fetches the source.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.video.thumbnailUrl}
        alt=""
        width={64}
        height={36}
        className="h-9 w-16 shrink-0 rounded object-cover bg-surface"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-9 w-16 shrink-0 items-center justify-center rounded bg-surface text-muted"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />
      </svg>
    </div>
  );
}
