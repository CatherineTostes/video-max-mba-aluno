import { redirect } from "next/navigation";

import { getSession } from "@/app/_lib/session";

/**
 * Sends authenticated visitors on a public page to their library.
 *
 * Renders nothing. It exists as its own component so the session read stays
 * behind a `<Suspense>` boundary: `getSession()` reads `cookies()`, which can
 * only happen at request time, and `cacheComponents` rejects it outside a
 * boundary. Keeping it here lets the rest of `/`, `/login`, and `/register`
 * prerender into the static shell regardless.
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
