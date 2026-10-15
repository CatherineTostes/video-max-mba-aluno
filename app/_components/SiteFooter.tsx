/**
 * Cached so the copyright year is resolved once and baked into the static
 * shell. `cacheComponents` (see `next.config.ts`) treats a bare `new Date()`
 * during prerender as a build error, and caching the value is the documented
 * fix for a timestamp that does not need to be per-request.
 */
export async function SiteFooter() {
  "use cache";

  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-outline bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold tracking-tight text-foreground">
          VideoMax MBA
        </p>
        <p className="text-sm text-muted">
          Transcription and AI summaries for your private video library.
        </p>
        <p className="text-sm text-muted">&copy; {year} VideoMax MBA</p>
      </div>
    </footer>
  );
}
