import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const stub = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * `server-only` throws unless it is loaded under React's `react-server`
 * condition, which Vitest does not set. Both projects swap it for a no-op so
 * the marker can stay on the server modules where it belongs.
 */
const serverOnlyStub = { "server-only": stub("./tests/stubs/empty.ts") };

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: {
          tsconfigPaths: true,
          alias: serverOnlyStub,
        },
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["app/**/__tests__/**/*.test.{ts,tsx}"],
          exclude: ["app/**/__tests__/**/*.integration.test.ts"],
        },
      },
      {
        resolve: {
          tsconfigPaths: true,
          alias: {
            ...serverOnlyStub,
            // The auth modules talk to the request through these two. Swapping
            // them for in-memory stubs is what lets the Server Actions run
            // outside a Next.js request scope.
            "next/headers": stub("./tests/stubs/next-headers.ts"),
            "next/navigation": stub("./tests/stubs/next-navigation.ts"),
          },
        },
        test: {
          name: "integration",
          environment: "node",
          include: ["app/**/__tests__/**/*.integration.test.ts"],
          globalSetup: ["./tests/setup/testcontainers.ts"],
          setupFiles: ["./tests/setup/integration.setup.ts"],
          // One Postgres container is shared across files, and each test
          // truncates the tables it works on, so files must not overlap.
          fileParallelism: false,
          // bcrypt at cost 12 is deliberately slow, and the container needs a
          // moment to come up on a cold Docker.
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
