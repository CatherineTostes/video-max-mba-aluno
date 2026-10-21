/**
 * Session lifetime constants.
 *
 * A session slides forward on use so an active user is never logged out mid-
 * work, but it dies at the absolute cap no matter how often it was refreshed,
 * which bounds how long a leaked cookie stays useful.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far ahead `expires_at` is pushed on creation and on each refresh. */
export const SLIDING_SESSION_TTL_MS = 30 * DAY_MS;

/** Hard ceiling, set once at creation and never moved. */
export const ABSOLUTE_SESSION_TTL_MS = 60 * DAY_MS;

/**
 * Minimum age before a read bothers to slide `expires_at`.
 *
 * Without it every authenticated request would write to the `session` table.
 * One write per day per session keeps the sliding window accurate enough.
 */
export const SESSION_REFRESH_THRESHOLD_MS = DAY_MS;
