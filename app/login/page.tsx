import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SessionRedirect } from "@/app/_components/SessionRedirect";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { login } from "@/app/_lib/auth/login";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your VideoMax MBA library.",
};

export default function LoginPage() {
  return (
    <>
      {/* See the note in app/register/page.tsx — same request-time session
          read, same reason for the boundary. */}
      <Suspense fallback={null}>
        <SessionRedirect />
      </Suspense>

      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-md px-6 pt-16 pb-24 sm:pt-20">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Log in
          </h1>
          <p className="mt-3 text-base leading-7 text-muted">
            Welcome back. Pick up where you left off.
          </p>

          <LoginForm action={login} />

          <p className="mt-8 text-sm text-muted">
            New here?{" "}
            <Link
              href="/register"
              className="rounded-md font-medium text-accent transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Create account
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
