"use client";

import { useFormStatus } from "react-dom";

import { logout } from "@/app/_lib/auth/logout";

/**
 * Logout trigger, ready for whichever feature builds the app shell.
 *
 * A plain `<form>` posting to the Server Action rather than an onClick
 * handler: it keeps working without JavaScript, and Next.js applies its
 * same-origin check to the submission for free.
 */
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <LogoutSubmit className={className} />
    </form>
  );
}

function LogoutSubmit({ className }: { className?: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        className ??
        "rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
      }
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
