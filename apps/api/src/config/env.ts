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

  // Mobile app deep-link scheme, trusted for BetterAuth OAuth redirects back
  // into the Expo app (must match `scheme` in apps/mobile/app.json).
  MOBILE_APP_SCHEME: z.string().default("portfoliooptimization://"),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z
    .string()
    .default("Portfolio Optimization <onboarding@resend.dev>"),

  // Billing (Stripe)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Billing (Coinbase Commerce)
  COINBASE_COMMERCE_API_KEY: z.string().optional(),
  COINBASE_COMMERCE_WEBHOOK_SECRET: z.string().optional(),

  // Financial advisor booking
  ADVISOR_BOOKING_URL: z
    .string()
    .default("https://cal.com/REPLACE_ME/advisor-30min"),
  ADVISOR_CALL_COST_CREDITS: z.coerce.number().int().positive().default(100),

  // Shared secret for machine-to-machine calls (the Vercel cron trigger).
  INTERNAL_API_SECRET: z.string().min(32).optional(),
});

export const env = envSchema
  .superRefine((value, ctx) => {
    // Refuse to boot rather than expose /api/internal with a guessable or
    // missing secret.
    if (process.env.NODE_ENV === "production" && !value.INTERNAL_API_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_API_SECRET"],
        message: "INTERNAL_API_SECRET is required in production",
      });
    }
  })
  .parse(process.env);

export type Env = z.infer<typeof envSchema>;
