import { Suspense } from "react";

import { Hero } from "@/app/_components/Hero";
import { HowItWorksStrip } from "@/app/_components/HowItWorksStrip";
import { SessionRedirect } from "@/app/_components/SessionRedirect";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { SiteHeader } from "@/app/_components/SiteHeader";

export default function Home() {
  return (
    <>
      {/* Renders nothing; redirects authenticated visitors to /app. Behind a
          boundary so the marketing page below still prerenders statically. */}
      <Suspense fallback={null}>
        <SessionRedirect />
      </Suspense>

      <SiteHeader />

      <main className="flex-1">
        <Hero />
        <HowItWorksStrip />
      </main>

      <SiteFooter />
    </>
  );
}
