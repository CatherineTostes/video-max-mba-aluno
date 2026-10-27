import { getSession } from "@/app/_lib/session";
import {
  UPLOAD_ERROR_HTTP_STATUS,
  UPLOAD_ERROR_MESSAGES,
  VideoUploadError,
  type UploadErrorCode,
} from "@/app/_lib/videos/errors";
import { uploadVideo } from "@/app/_lib/videos/upload";

/**
 * POST /api/videos?name=<filename>&size=<bytes>
 *
 * A Route Handler rather than a Server Action because the body can be 2 GB:
 * Server Actions buffer their payload (and cap it at 1 MB by default), while
 * this streams `request.body` straight to disk. The body is the raw file as
 * `application/octet-stream`; the filename and size travel in the query string
 * so they can be validated before a single byte is read.
 */

// Runs on the Node.js runtime (filesystem, child processes). That is the
// default, and `cacheComponents` forbids the `runtime` segment export, so it is
// not declared here.

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();

  if (!session) {
    return errorResponse("UPL_UNAUTHORIZED");
  }

  const { searchParams } = new URL(request.url);

  try {
    const video = await uploadVideo({
      userId: session.user.id,
      body: request.body,
      declaredName: searchParams.get("name"),
      declaredSize: searchParams.get("size"),
      declaredMime: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
    });

    return Response.json(video, { status: 201 });
  } catch (error) {
    if (error instanceof VideoUploadError) {
      if (error.code === "UPL_DISK_WRITE") {
        console.error("Video upload failed writing to disk", error);
      }

      return errorResponse(error.code);
    }

    console.error("Unexpected video upload failure", error);

    return errorResponse("UPL_DISK_WRITE");
  }
}

/**
 * Always the canonical message for the code — never `error.message`, which can
 * carry filesystem details meant for the server log.
 */
function errorResponse(code: UploadErrorCode): Response {
  return Response.json(
    { code, message: UPLOAD_ERROR_MESSAGES[code] },
    { status: UPLOAD_ERROR_HTTP_STATUS[code] },
  );
}
