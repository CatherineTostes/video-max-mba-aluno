import { redirect } from "next/navigation";

import { getSession } from "@/app/_lib/session";

/**
 * Sends authenticated visitors from the public landing page to their library.
 *
 * Renders nothing. It exists as its own component so the session read stays
 * behind the `<Suspense>` boundary in `app/page.tsx`: once F02 makes
 * `getSession()` read `cookies()`, that read can only happen at request time,
 * and `cacheComponents` rejects it outside a boundary. Keeping it here lets the
 * whole marketing page prerender into the static shell regardless.
 *
 * In a streaming context `redirect()` emits a client-side redirect rather than
 * a 307, which is expected here.
 */
export async function SessionRedirect() {
  const session = await getSession();

  if (session) {
    redirect("/app");
  }

  return null;
}
