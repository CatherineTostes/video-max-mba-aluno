import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js reads `.env.local` on its own; the Prisma CLI does not, so load it
// here. `.env` is kept as a fallback for CI, where the value usually comes
// straight from the environment and neither file exists.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
