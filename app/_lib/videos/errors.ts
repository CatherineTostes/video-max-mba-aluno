/**
 * Typed upload failures.
 *
 * The same codes travel the whole path: thrown on the server, mapped to an HTTP
 * status by the Route Handler, sent as `{ code, message }`, and turned back
 * into a user-facing message by the client. Keeping them in one client-safe
 * module is what stops the three ends from drifting.
 */

export const UPLOAD_ERROR_CODES = [
  "UPL_UNAUTHORIZED",
  "UPL_BAD_EXTENSION",
  "UPL_BAD_MIME",
  "UPL_MISSING_NAME",
  "UPL_MISSING_SIZE",
  "UPL_SIZE_MISMATCH",
  "UPL_TOO_LARGE",
  "UPL_INCOMPLETE",
  "UPL_DISK_WRITE",
  "UPL_PATH_TRAVERSAL",
  // Client-side only: a zero-byte file is caught before any request is made.
  "UPL_EMPTY",
] as const;

export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

export function isUploadErrorCode(value: unknown): value is UploadErrorCode {
  return (
    typeof value === "string" &&
    (UPLOAD_ERROR_CODES as readonly string[]).includes(value)
  );
}

/** HTTP status for each code, as documented in the F03 API contract. */
export const UPLOAD_ERROR_HTTP_STATUS: Record<UploadErrorCode, number> = {
  UPL_UNAUTHORIZED: 401,
  UPL_BAD_EXTENSION: 400,
  UPL_BAD_MIME: 400,
  UPL_MISSING_NAME: 400,
  UPL_MISSING_SIZE: 400,
  UPL_SIZE_MISMATCH: 400,
  UPL_TOO_LARGE: 413,
  UPL_INCOMPLETE: 400,
  UPL_DISK_WRITE: 500,
  UPL_PATH_TRAVERSAL: 400,
  UPL_EMPTY: 400,
};

/** User-facing copy. The first two strings are quoted verbatim from the PRD. */
export const UPLOAD_ERROR_MESSAGES: Record<UploadErrorCode, string> = {
  UPL_BAD_EXTENSION: "Only MP4, MOV, MKV, WEBM, and AVI files are supported",
  UPL_TOO_LARGE: "Files must be at most 2GB",
  UPL_INCOMPLETE: "Upload interrupted — retry",
  UPL_DISK_WRITE: "Upload failed — please try again",
  UPL_UNAUTHORIZED: "Your session has expired — log in again to upload",
  UPL_EMPTY: "This file is empty",
  UPL_BAD_MIME: "Upload failed — please try again",
  UPL_MISSING_NAME: "Upload failed — please try again",
  UPL_MISSING_SIZE: "Upload failed — please try again",
  UPL_SIZE_MISMATCH: "Upload failed — please try again",
  UPL_PATH_TRAVERSAL: "Upload failed — please try again",
};

export class VideoUploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode, message?: string) {
    super(message ?? UPLOAD_ERROR_MESSAGES[code]);
    this.name = "VideoUploadError";
    this.code = code;
  }

  get httpStatus(): number {
    return UPLOAD_ERROR_HTTP_STATUS[this.code];
  }
}
