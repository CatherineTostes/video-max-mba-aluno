import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach } from "vitest";

import { formatSessionCookieValue, SESSION_COOKIE_NAME } from "@/app/_lib/cookies";
import { createSession } from "@/app/_lib/auth/session-store";
import { seedUser, type SeedUserOverrides } from "@/tests/helpers/auth";
import { testCookieJar } from "@/tests/stubs/next-headers";

/** Shared plumbing for the F03 upload suites. */

/**
 * Points `VIDEO_STORAGE_ROOT` at a fresh temp directory for every test and
 * deletes it afterwards. Returns a getter for the current root.
 */
export function withTempStorageRoot(): () => string {
  let root = "";
  const previous = process.env.VIDEO_STORAGE_ROOT;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "videomax-storage-"));
    process.env.VIDEO_STORAGE_ROOT = root;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    process.env.VIDEO_STORAGE_ROOT = previous;
    delete process.env.VIDEO_MAX_BYTES;
  });

  return () => root;
}

/** Seeds a user and puts a valid session cookie in the jar, like a browser. */
export async function signInAs(overrides: SeedUserOverrides = {}) {
  const { user } = await seedUser(overrides);
  const sessionId = await createSession(user.id);

  testCookieJar.seed(SESSION_COOKIE_NAME, formatSessionCookieValue(sessionId));

  return user;
}

/** `length` bytes of a repeating pattern, in chunks — a stand-in video body. */
export function bytes(length: number): Uint8Array {
  const data = new Uint8Array(length);

  for (let i = 0; i < length; i += 1) {
    data[i] = i % 251;
  }

  return data;
}

/** A web stream that yields `data` in `chunkSize` pieces and then closes. */
export function streamOf(
  data: Uint8Array,
  chunkSize = 64 * 1024,
): ReadableStream<Uint8Array> {
  let offset = 0;

  return new ReadableStream({
    pull(controller) {
      if (offset >= data.length) {
        controller.close();
        return;
      }

      controller.enqueue(data.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}

/**
 * A web stream that sends `sentBytes` and then errors, the way a request body
 * does when the client goes away mid-upload.
 */
export function brokenStream(sentBytes: number): ReadableStream<Uint8Array> {
  let sent = false;

  return new ReadableStream({
    pull(controller) {
      if (!sent) {
        controller.enqueue(bytes(sentBytes));
        sent = true;
        return;
      }

      controller.error(new Error("aborted"));
    },
  });
}
