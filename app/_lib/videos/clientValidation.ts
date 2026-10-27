import {
  allowedExtensionOf,
  DEFAULT_MAX_VIDEO_BYTES,
} from "@/app/_lib/videos/constants";
import {
  UPLOAD_ERROR_MESSAGES,
  type UploadErrorCode,
} from "@/app/_lib/videos/errors";

/**
 * Browser-side pre-flight check, run before any byte leaves the machine.
 *
 * It mirrors the server's rules using the same constants. The server checks
 * again — this one exists so a 3 GB file is refused instantly instead of after
 * minutes of uploading.
 */

export type ClientFileCheck =
  | { ok: true }
  | {
      ok: false;
      reason: Extract<
        UploadErrorCode,
        "UPL_BAD_EXTENSION" | "UPL_TOO_LARGE" | "UPL_EMPTY"
      >;
      message: string;
    };

export function validateClientFile(
  file: Pick<File, "name" | "size">,
  maxBytes: number = DEFAULT_MAX_VIDEO_BYTES,
): ClientFileCheck {
  if (!allowedExtensionOf(file.name)) {
    return reject("UPL_BAD_EXTENSION");
  }

  if (file.size > maxBytes) {
    return reject("UPL_TOO_LARGE");
  }

  // A zero-byte file is never a video; say so rather than "too large".
  if (file.size <= 0) {
    return reject("UPL_EMPTY");
  }

  return { ok: true };
}

function reject(
  reason: "UPL_BAD_EXTENSION" | "UPL_TOO_LARGE" | "UPL_EMPTY",
): ClientFileCheck {
  return { ok: false, reason, message: UPLOAD_ERROR_MESSAGES[reason] };
}
