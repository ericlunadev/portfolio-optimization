import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().default("file:portfolio.db"),
  DATABASE_AUTH_TOKEN: z.string().optional(),

  // Auth
  BETTER_AUTH_SECRET: z.string().default("change-me-in-production"),

  // OAuth - Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // OAuth - GitHub
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // OAuth - Microsoft
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(8001),

  // URLs
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  BACKEND_URL: z.string().default("http://localhost:8001"),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
