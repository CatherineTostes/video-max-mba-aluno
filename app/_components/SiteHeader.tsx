import Link from "next/link";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-md";

export function SiteHeader() {
  return (
    <header className="border-b border-outline bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className={`text-lg font-semibold tracking-tight text-foreground ${focusRing}`}>
          VideoMax<span className="text-accent">.</span>MBA
        </Link>

        <nav aria-label="Main">
          <Link
            href="/login"
            className={`px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground ${focusRing}`}
          >
            Log in
          </Link>
        </nav>
      </div>
    </header>
  );
}
