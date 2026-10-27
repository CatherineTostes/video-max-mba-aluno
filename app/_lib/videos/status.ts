/**
 * Every processing status a video can be in.
 *
 * F03 only ever writes `validating`; F07 moves rows through the rest. The
 * database stores the value as `varchar(16)` with a CHECK constraint listing
 * these same five strings (see the `add_video` migration), so adding a stage
 * means editing both places — but never a Postgres enum migration.
 */

export const VIDEO_STATUSES = [
  "validating",
  "transcribing",
  "summarizing",
  "ready",
  "failed",
] as const;

export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** Named constants, so call sites read `VideoStatus.Validating`. */
export const VideoStatus = {
  Validating: "validating",
  Transcribing: "transcribing",
  Summarizing: "summarizing",
  Ready: "ready",
  Failed: "failed",
} as const satisfies Record<string, VideoStatus>;

export function isVideoStatus(value: unknown): value is VideoStatus {
  return (
    typeof value === "string" &&
    (VIDEO_STATUSES as readonly string[]).includes(value)
  );
}
