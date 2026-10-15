import Link from "next/link";

export function Hero() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
          VideoMax MBA
        </p>

        <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl sm:leading-[1.1]">
          Know what is inside your videos without watching them again.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
          Upload a recording and get a timestamped transcription you can click
          through and an AI summary you can read in seconds. Your library stays
          private, organized with folders and tags, and searchable down to the
          sentence.
        </p>

        <div className="mt-10">
          <Link
            href="/register"
            className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-7 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Create account
          </Link>
          <p className="mt-4 text-sm text-muted">
            Free to use. No credit card, no per-minute charges.
          </p>
        </div>
      </div>
    </section>
  );
}
