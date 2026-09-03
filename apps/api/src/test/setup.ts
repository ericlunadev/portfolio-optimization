// Vitest global setup: gives every test file a throwaway libSQL database that
// carries the production schema.
//
// Wired in from vitest.config.ts as `setupFiles`. Vitest evaluates this module —
// top-level await included — before the test file it is attached to is imported,
// which is the whole point: `db/index.ts` builds its libSQL client at module
// scope from `env.DATABASE_URL`, so the URL has to be right before anything
// under test is loaded.
//
// That module-scope client is why there is no client factory. Turning `db` into
// a factory would touch all ~20 import sites for no gain here: setting the env
// var first gets the same isolation, and it keeps production code identical to
// what the tests exercise.
//
// The migrations are the COMMITTED files under `drizzle/`, applied with
// drizzle-orm's runtime migrator — drizzle-kit is a CLI and cannot be called
// from a test. Tests therefore run against the schema production actually gets,
// including the 0007/0009 backfills, rather than a `db:push` of schema.ts.

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";

// One directory per vitest worker, so parallel workers never share a database.
// Test files inside a worker run one at a time, and the rm below plus the
// afterAll teardown mean each of them starts from an empty file.
const workerId =
  process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID ?? String(process.pid);
const workerDir = join(tmpdir(), `portfolio-api-test-${workerId}`);

rmSync(workerDir, { recursive: true, force: true });
mkdirSync(workerDir, { recursive: true });

const databaseFile = join(workerDir, "api.db");
process.env.DATABASE_URL = `file:${databaseFile}`;
// A file URL takes no auth token, and a stale one from a developer's shell
// makes the client reject the connection.
delete process.env.DATABASE_AUTH_TOKEN;

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

// A client of our own, not `db/index.ts`'s: importing that here would cache the
// singleton in this module graph and hand it to the test file, defeating any
// test that wants to point DATABASE_URL somewhere else first.
const migrationClient = createClient({ url: process.env.DATABASE_URL });
await migrate(drizzle(migrationClient), { migrationsFolder });
migrationClient.close();

afterAll(() => {
  rmSync(workerDir, { recursive: true, force: true });
});
