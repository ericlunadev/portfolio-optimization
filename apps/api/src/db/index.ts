import { drizzle } from "drizzle-orm/libsql";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

export const db = drizzle({
  connection: {
    url: env.DATABASE_URL,
    authToken: env.DATABASE_AUTH_TOKEN,
  },
  schema,
});

export type DB = typeof db;
