import type { VideoDTO } from "@/app/_lib/videos/dto";
import {
  isUploadErrorCode,
  UPLOAD_ERROR_MESSAGES,
  type UploadErrorCode,
} from "@/app/_lib/videos/errors";

/**
 * Browser transport for `POST /api/videos`.
 *
 * `XMLHttpRequest` rather than `fetch` because only XHR reports upload
 * progress (`xhr.upload.onprogress`), and the progress card needs bytes sent.
 * The file is sent as the raw body; the browser streams it from disk and sets
 * `Content-Length` itself.
 */

export type UploadProgress = { loaded: number; total: number };

export class UploadClientError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode, message?: string) {
    super(message ?? UPLOAD_ERROR_MESSAGES[code]);
    this.name = "UploadClientError";
    this.code = code;
  }
}

export type UploadFileOptions = {
  file: File;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
};

export const UPLOAD_ENDPOINT = "/api/videos";

export function uploadVideoFile({
  file,
  onProgress,
  signal,
}: UploadFileOptions): Promise<VideoDTO> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    const query = new URLSearchParams({
      name: file.name,
      size: String(file.size),
    });

    const onAbortSignal = () => xhr.abort();
    signal?.addEventListener("abort", onAbortSignal, { once: true });

    const cleanup = () => signal?.removeEventListener("abort", onAbortSignal);

    xhr.open("POST", `${UPLOAD_ENDPOINT}?${query.toString()}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.responseType = "text";

    xhr.upload.onprogress = (event) => {
      onProgress?.({
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : file.size,
      });
    };

    xhr.onload = () => {
      cleanup();

      if (xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText) as VideoDTO);
        } catch {
          reject(new UploadClientError("UPL_DISK_WRITE"));
        }
        return;
      }

      reject(errorFromResponse(xhr.status, xhr.responseText));
    };

    // The connection dropped — network loss, server restart, laptop lid.
    xhr.onerror = () => {
      cleanup();
      reject(new UploadClientError("UPL_INCOMPLETE"));
    };

    xhr.ontimeout = xhr.onerror;

    xhr.onabort = () => {
      cleanup();
      reject(abortError());
    };

    xhr.send(file);
  });
}

function errorFromResponse(status: number, body: string): UploadClientError {
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };

    if (isUploadErrorCode(parsed.code)) {
      return new UploadClientError(parsed.code);
    }
  } catch {
    // Not our JSON — a proxy error page, say. Fall back on the status.
  }

  if (status === 401) {
    return new UploadClientError("UPL_UNAUTHORIZED");
  }

  if (status === 413) {
    return new UploadClientError("UPL_TOO_LARGE");
  }

  return new UploadClientError("UPL_DISK_WRITE");
}

function abortError(): DOMException {
  return new DOMException("Upload cancelled", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
