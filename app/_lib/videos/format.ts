/**
 * Display helpers for sizes and durations. Binary units, to match the 2 GB
 * (2 GiB) limit users are told about.
 */

const UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const digits = unit === 0 || value >= 100 ? 0 : 1;

  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

/** Whole percent, clamped to 0–100. An empty total reads as 0%. */
export function percentOf(loaded: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.floor((loaded / total) * 100)));
}

/** `h:mm:ss` or `m:ss`. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
