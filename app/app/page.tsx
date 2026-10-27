import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppHeader } from "@/app/_components/AppHeader";
import { SiteFooter } from "@/app/_components/SiteFooter";
import { UploadDropZone } from "@/app/_components/upload/UploadDropZone";
import { UploadProgressList } from "@/app/_components/upload/UploadProgressList";
import { getSession } from "@/app/_lib/session";
import { listVideosForUser, toVideoDTO } from "@/app/_lib/videos/repository";
import { VideoList } from "./_components/VideoList";

export const metadata: Metadata = {
  title: "Your library",
};

/**
 * `/app` — the authenticated home: upload zone, upload progress, and the
 * user's videos. F04 will grow this into the full library.
 */
export default function LibraryPage() {
  return (
    // The session is a request-time read, which `cacheComponents` only allows
    // inside a Suspense boundary. The fallback is the prerendered shell.
    <Suspense fallback={<LibraryFallback />}>
      <Library />
    </Suspense>
  );
}

async function Library() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const videos = (await listVideosForUser(session.user.id)).map(toVideoDTO);

  return (
    <>
      <AppHeader userName={session.user.name} />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 pt-12 pb-24">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Your library
          </h1>
          <p className="mt-2 text-base text-muted">
            Upload a video to get a transcription and an AI summary.
          </p>

          <div className="mt-8">
            <UploadDropZone />
            <UploadProgressList />
          </div>

          <section aria-labelledby="videos-heading" className="mt-12">
            <h2
              id="videos-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Videos
            </h2>
            <VideoList videos={videos} />
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

function LibraryFallback() {
  return (
    <>
      <header className="h-16 border-b border-outline bg-background" />
      <main className="flex-1" aria-busy="true">
        <div className="mx-auto w-full max-w-6xl px-6 pt-12 pb-24">
          <div className="h-9 w-48 rounded bg-surface" />
          <div className="mt-8 h-56 rounded-lg bg-surface" />
        </div>
      </main>
    </>
  );
}
