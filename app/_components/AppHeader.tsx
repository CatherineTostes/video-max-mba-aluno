import Link from "next/link";

import { LogoutButton } from "@/app/_components/LogoutButton";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-md";

/** Top bar for authenticated pages: logo back to the library, who you are, log out. */
export function AppHeader({ userName }: { userName: string }) {
  return (
    <header className="border-b border-outline bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          href="/app"
          className={`text-lg font-semibold tracking-tight text-foreground ${focusRing}`}
        >
          VideoMax<span className="text-accent">.</span>MBA
        </Link>

        <nav aria-label="Account" className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-muted">{userName}</span>
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
