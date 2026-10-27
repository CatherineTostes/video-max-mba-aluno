"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";

import { validateClientFile } from "@/app/_lib/videos/clientValidation";
import { FILE_INPUT_ACCEPT } from "@/app/_lib/videos/constants";
import { useUploadQueue } from "./useUploadQueue";

type Rejection = { key: string; fileName: string; message: string };

/** How long a rejection message stays up before clearing itself. */
const REJECTION_TTL_MS = 8_000;

/**
 * Drop area plus an "Upload video" button for people who prefer a file picker.
 *
 * Each file is checked in the browser first; valid ones join the upload queue
 * and invalid ones never leave the machine — the user gets the reason inline
 * instead.
 */
export function UploadDropZone() {
  const { enqueue } = useUploadQueue();
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const headingId = useId();
  const hintId = useId();

  useEffect(() => {
    if (rejections.length === 0) {
      return;
    }

    const timer = setTimeout(() => setRejections([]), REJECTION_TTL_MS);

    return () => clearTimeout(timer);
  }, [rejections]);

  // A file dropped just outside the zone would otherwise make the browser
  // navigate away to play it — and abandon any upload in progress.
  useEffect(() => {
    const swallow = (event: globalThis.DragEvent) => {
      if (!zoneRef.current?.contains(event.target as Node)) {
        event.preventDefault();
      }
    };

    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);

    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  function acceptFiles(files: readonly File[]) {
    const valid: File[] = [];
    const rejected: Rejection[] = [];

    for (const file of files) {
      const check = validateClientFile(file);

      if (check.ok) {
        valid.push(file);
      } else {
        rejected.push({
          key: `${file.name}-${file.size}-${file.lastModified}-${check.reason}`,
          fileName: file.name,
          message: check.message,
        });
      }
    }

    setRejections(rejected);

    if (valid.length > 0) {
      enqueue(valid);
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    // Moving over a child fires dragleave on the parent; ignore those.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    acceptFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <section aria-labelledby={headingId}>
      <div
        ref={zoneRef}
        data-testid="upload-drop-zone"
        data-dragging={isDragging || undefined}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
          isDragging
            ? "border-accent bg-accent/5"
            : "border-outline bg-surface"
        }`}
      >
        <UploadIcon />

        <h2
          id={headingId}
          className="mt-4 text-lg font-semibold tracking-tight text-foreground"
        >
          {isDragging ? "Drop to upload" : "Drag and drop videos here"}
        </h2>
        <p id={hintId} className="mt-2 text-sm text-muted">
          MP4, MOV, MKV, WEBM, or AVI · up to 2GB each
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-describedby={hintId}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Upload video
        </button>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FILE_INPUT_ACCEPT}
          aria-label="Choose video files"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            acceptFiles(Array.from(event.currentTarget.files ?? []));
            // Clear it, so picking the same file again still fires onChange.
            event.currentTarget.value = "";
          }}
        />
      </div>

      {rejections.length > 0 ? (
        <div
          role="alert"
          className="mt-4 flex items-start justify-between gap-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <ul className="space-y-1">
            {rejections.map((rejection) => (
              <li key={rejection.key}>
                <span className="font-medium">{rejection.fileName}</span>
                {" — "}
                {rejection.message}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setRejections([])}
            className="shrink-0 rounded-md font-medium text-red-700 hover:text-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Dismiss
          </button>
        </div>
      ) : null}
    </section>
  );
}

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-10 w-10 text-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4m0 0-4 4m4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
