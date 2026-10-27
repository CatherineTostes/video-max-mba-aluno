import type { VideoDTO } from "@/app/_lib/videos/dto";
import { formatBytes, formatDuration } from "@/app/_lib/videos/format";
import type { VideoStatus } from "@/app/_lib/videos/status";

/**
 * The user's videos, newest first.
 *
 * Deliberately minimal: it exists so an upload is visibly "in the library"
 * with its thumbnail and status. F04 replaces it with the real library (grid
 * and list views, sorting, rename, delete).
 */
export function VideoList({ videos }: { videos: VideoDTO[] }) {
  if (videos.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted">
        No videos yet. Upload one above to get started.
      </p>
    );
  }

  return (
    <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((video) => (
        <li key={video.id}>
          <article className="overflow-hidden rounded-lg border border-outline bg-background">
            <div className="relative aspect-video bg-surface">
              {/* Plain <img>: the endpoint needs the session cookie, which
                  next/image's server-side fetch would not send. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={video.thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {video.durationSeconds !== null ? (
                <span className="absolute right-2 bottom-2 rounded bg-foreground/80 px-1.5 py-0.5 text-xs font-medium text-background tabular-nums">
                  {formatDuration(video.durationSeconds)}
                </span>
              ) : null}
            </div>

            <div className="p-4">
              <h3
                className="truncate text-sm font-semibold text-foreground"
                title={video.title}
              >
                {video.title}
              </h3>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  {formatBytes(video.sizeBytes)} ·{" "}
                  {video.containerFormat.toUpperCase()}
                </span>
                <StatusBadge status={video.status} />
              </div>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

const STATUS_STYLES: Record<VideoStatus, { label: string; className: string }> =
  {
    validating: { label: "Validating", className: "bg-sky-50 text-sky-700" },
    transcribing: {
      label: "Transcribing",
      className: "bg-violet-50 text-violet-700",
    },
    summarizing: {
      label: "Summarizing",
      className: "bg-amber-50 text-amber-700",
    },
    ready: { label: "Ready", className: "bg-emerald-50 text-emerald-700" },
    failed: { label: "Failed", className: "bg-red-50 text-red-700" },
  };

function StatusBadge({ status }: { status: VideoStatus }) {
  const { label, className } = STATUS_STYLES[status];

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}
