import { getSession } from "@/app/_lib/session";
import { PLACEHOLDER_THUMBNAIL_PATH } from "@/app/_lib/videos/constants";
import { findVideoForUser } from "@/app/_lib/videos/repository";
import {
  readThumbnailStream,
  resolveStoredPath,
} from "@/app/_lib/videos/storage";

/**
 * GET /api/videos/:id/thumbnail
 *
 * Every "you cannot have this" answer is the same 404 — not logged in, not the
 * owner, no such video, file missing — so the endpoint never confirms that a
 * video id exists to someone who does not own it.
 */

// Runs on the Node.js runtime (filesystem, child processes). That is the
// default, and `cacheComponents` forbids the `runtime` segment export, so it is
// not declared here.

/** Prisma cuid(): lowercase alphanumerics. Anything else is not one of ours. */
const VIDEO_ID_PATTERN = /^[a-z0-9]{20,32}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  if (!VIDEO_ID_PATTERN.test(id)) {
    return notFound();
  }

  const session = await getSession();

  if (!session) {
    return notFound();
  }

  const video = await findVideoForUser(id, session.user.id);

  if (!video) {
    return notFound();
  }

  if (!video.thumbnailPath) {
    // Extraction failed at upload time. Not cached, so a thumbnail generated
    // later (say, by a pipeline retry) shows up without a hard refresh.
    return new Response(null, {
      status: 307,
      headers: {
        Location: PLACEHOLDER_THUMBNAIL_PATH,
        "Cache-Control": "private, no-store",
      },
    });
  }

  let file: Awaited<ReturnType<typeof readThumbnailStream>>;

  try {
    file = await readThumbnailStream(resolveStoredPath(video.thumbnailPath));
  } catch {
    // A stored path that resolves outside the root is treated as missing.
    file = null;
  }

  if (!file) {
    return notFound();
  }

  return new Response(file.stream, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(file.size),
      "Cache-Control": "private, max-age=86400",
    },
  });
}

function notFound(): Response {
  return Response.json(
    { code: "THUMB_NOT_FOUND", message: "Thumbnail not found" },
    { status: 404 },
  );
}
