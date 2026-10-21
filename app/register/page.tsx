import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SessionRedirect } from "@/app/_components/SessionRedirect";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { register } from "@/app/_lib/auth/register";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = {
  title: "Create account",
  description:
    "Create your VideoMax MBA account and start turning videos into searchable transcriptions and summaries.",
};

export default function RegisterPage() {
  return (
    <>
      {/* Renders nothing; sends anyone already signed in to their library.
          Behind a boundary because it reads the session cookie, which with
          `cacheComponents` is a request-time read. */}
      <Suspense fallback={null}>
        <SessionRedirect />
      </Suspense>

      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-md px-6 pt-16 pb-24 sm:pt-20">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Create your account
          </h1>
          <p className="mt-3 text-base leading-7 text-muted">
            Free to use. Your library stays private to you.
          </p>

          <RegisterForm action={register} />

          <p className="mt-8 text-sm text-muted">
            Already have an account?{" "}
            <Link
              href="/login"
              className="rounded-md font-medium text-accent transition-colors hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Log in
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
