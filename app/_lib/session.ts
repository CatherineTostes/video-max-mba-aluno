/**
 * Session read helper.
 *
 * F01 ships a placeholder that always resolves to `null`, so the landing page
 * can implement its "authenticated visitors go to /app" rule before auth
 * exists. F02 (Authentication System) replaces the body of `getSession` and the
 * shape of `Session`; no call site should need to change.
 *
 * Note for F02: `cacheComponents` is enabled in `next.config.ts`. Once this
 * function reads `cookies()` it becomes a request-time read, which Next.js only
 * allows inside a `<Suspense>` boundary or a `'use cache: private'` scope.
 * `app/_components/SessionRedirect.tsx` is already wrapped in one.
 * Consider adding `import "server-only"` here at that point.
 */

export type Session = {
  userId: string;
};

export async function getSession(): Promise<Session | null> {
  return null;
}
