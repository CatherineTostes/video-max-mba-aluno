const steps = [
  {
    title: "Upload",
    description:
      "Drop an MP4, MOV, MKV, WEBM, or AVI file up to 2GB. Keep browsing while it transfers.",
  },
  {
    title: "Transcribe",
    description:
      "Every sentence is timestamped, so a click on any line jumps the player straight to that moment.",
  },
  {
    title: "Summarize",
    description:
      "An overview paragraph and a list of key topics land under the player when processing finishes.",
  },
];

export function HowItWorksStrip() {
  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="border-y border-outline bg-surface"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <h2
          id="how-it-works-heading"
          className="text-sm font-semibold uppercase tracking-[0.18em] text-muted"
        >
          How it works
        </h2>

        <ol className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="text-sm font-semibold tabular-nums text-accent">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-base leading-7 text-muted">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
