"use server";

import { redirect } from "next/navigation";

import { deleteSession } from "@/app/_lib/auth/session-store";
import { clearSessionCookie, readSessionCookie } from "@/app/_lib/cookies";

/**
 * Ends the current session.
 *
 * Idempotent by design — a second click, a stale tab, or a cookie whose row is
 * already gone all land on `/` without an error. There is nothing a failed
 * logout could usefully tell the user.
 */
export async function logout(): Promise<void> {
  const sessionId = await readSessionCookie();

  if (sessionId) {
    await deleteSession(sessionId);
  }

  await clearSessionCookie();

  redirect("/");
}
