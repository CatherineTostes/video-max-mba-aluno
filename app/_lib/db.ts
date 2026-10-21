import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/prisma/generated/client/client";

/**
 * Prisma client singleton.
 *
 * Next.js dev hot-reloads modules on every edit. Without the `globalThis`
 * cache each reload would build a fresh client and a fresh connection pool,
 * and Postgres would run out of connections within a few saves. Production
 * loads this module once, so the cache is dev-only.
 */

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
    );
  }

  // Prisma 7 runs on the query compiler, so the driver is supplied by the app
  // rather than by a bundled Rust engine.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
