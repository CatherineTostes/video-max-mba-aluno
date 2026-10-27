import { afterAll, beforeEach, inject } from "vitest";

import { testCookieJar } from "@/tests/stubs/next-headers";

/**
 * Per-worker bootstrap for the integration project.
 *
 * The environment has to be in place before anything imports `app/_lib/db.ts`,
 * which builds its Prisma client at module load — hence the dynamic import
 * below rather than a top-level one.
 */

process.env.DATABASE_URL = inject("databaseUrl");
process.env.SESSION_SECRET =
  "integration-test-session-secret-at-least-32-chars";

const { prisma } = await import("@/app/_lib/db");

beforeEach(async () => {
  // CASCADE because `session` and `video` have foreign keys onto `user`; RESTART IDENTITY
  // is harmless here and keeps the statement correct if a later feature adds a
  // serial column.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "video", "session", "user" RESTART IDENTITY CASCADE',
  );

  testCookieJar.reset();
});

afterAll(async () => {
  await prisma.$disconnect();
});
