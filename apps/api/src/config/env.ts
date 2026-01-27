import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().default("./portfolio.db"),

  // JWT
  JWT_SECRET_KEY: z.string().default("change-me-in-production"),
  ACCESS_TOKEN_EXPIRE_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_EXPIRE_DAYS: z.coerce.number().default(7),

  // OAuth - Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // OAuth - GitHub
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // OAuth - Microsoft
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),

  // URLs
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  BACKEND_URL: z.string().default("http://localhost:8000"),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
