import { execFileSync } from "node:child_process";

import { PostgreSqlContainer } from "@testcontainers/postgresql";

/**
 * Brings up a throwaway Postgres for the integration project and migrates it.
 *
 * A disposable container rather than a shared test database: every run starts
 * from the real migration history on an empty schema, so a suite cannot pass
 * because of state another suite left behind.
 */

declare module "vitest" {
  interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Vitest 5 hands the global setup its project object. Only `provide` is used
 * here, and Vitest 5 no longer exports a type for the whole thing.
 */
type GlobalSetupContext = {
  provide: (key: "databaseUrl", value: string) => void;
};

export default async function setup({ provide }: GlobalSetupContext) {
  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("videomax_test")
    .withUsername("videomax")
    .withPassword("videomax")
    .start();

  const databaseUrl = container.getConnectionUri();

  // `prisma migrate deploy` replays the committed migrations, so the schema
  // under test is the one that will reach production — not a `db push`
  // approximation of it.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  provide("databaseUrl", databaseUrl);

  return async () => {
    await container.stop();
  };
}
