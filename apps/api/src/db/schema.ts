import { sqliteTable, text, integer, real, unique, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// ==================== AUTH (BetterAuth) ====================

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ==================== FUNDS ====================

export const funds = sqliteTable(
  "funds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    longName: text("long_name"),
    yahooTicker: text("yahoo_ticker"),
    portfolioCode: text("portfolio_code"),
    expRet: real("exp_ret").default(0.05),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }),
  },
  (t) => [index("fund_name_idx").on(t.name)]
);

export const prices = sqliteTable(
  "prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fundId: integer("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // ISO date string YYYY-MM-DD
    price: real("price").notNull(),
  },
  (t) => [unique("price_unique").on(t.fundId, t.date), index("price_fund_idx").on(t.fundId), index("price_date_idx").on(t.date)]
);

export const fundExposures = sqliteTable(
  "fund_exposures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    portfolioCode: text("portfolio_code").notNull(),
    mRating: text("m_rating"),
    rating: text("rating"),
    ticker: text("ticker"),
    mvPct: real("mv_pct"),
    asOfDate: text("as_of_date"),
  },
  (t) => [index("exposure_portfolio_idx").on(t.portfolioCode)]
);

export const keyFigures = sqliteTable(
  "key_figures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    portfolioCode: text("portfolio_code").notNull(),
    figureKey: text("figure_key").notNull(),
    value: real("value"),
    asOfDate: text("as_of_date"),
  },
  (t) => [index("key_figures_portfolio_idx").on(t.portfolioCode)]
);

export const indexData = sqliteTable(
  "index_data",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    security: text("security").notNull(),
    date: text("date").notNull(),
    value: real("value").notNull(),
  },
  (t) => [unique("index_unique").on(t.security, t.date), index("index_security_idx").on(t.security)]
);

// ==================== USER ASSUMPTIONS ====================

export const userAssumptions = sqliteTable(
  "user_assumptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fundId: integer("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "cascade" }),
    expRet: real("exp_ret"),
    volatility: real("volatility"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [unique("user_fund_unique").on(t.userId, t.fundId)]
);

export const userCorrelations = sqliteTable(
  "user_correlations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fundId1: integer("fund_id_1")
      .notNull()
      .references(() => funds.id),
    fundId2: integer("fund_id_2")
      .notNull()
      .references(() => funds.id),
    correlation: real("correlation").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [unique("user_corr_unique").on(t.userId, t.fundId1, t.fundId2)]
);

// ==================== USER PROFILE (Onboarding) ====================

export const userProfile = sqliteTable("user_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),

  // Step 1 — Localization
  countryCode: text("country_code"),
  currency: text("currency"),

  // Step 2 — Investor profile
  experience: text("experience"),
  horizon: text("horizon"),
  riskBehavior: text("risk_behavior"),
  riskTolerance: text("risk_tolerance"),
  goal: text("goal"),

  // Step 3 — Market preferences (JSON-encoded arrays)
  marketsOfInterest: text("markets_of_interest"),
  otherMarkets: text("other_markets"),
  conceptFamiliarity: text("concept_familiarity"),

  // Progress
  currentStep: integer("current_step").notNull().default(1),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

// ==================== TASKS ====================

export const backgroundTasks = sqliteTable("background_tasks", {
  id: text("id").primaryKey(), // UUID
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  taskType: text("task_type").notNull(),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed, cancelled
  progress: real("progress").default(0),
  resultData: text("result_data"), // JSON string
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ==================== SIMULATIONS ====================

export const simulations = sqliteTable("simulations", {
  id: text("id").primaryKey(), // UUID
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  name: text("name"),
  params: text("params").notNull(), // JSON string with SimulationParams
  result: text("result").notNull(), // JSON string with OptimizationResultWithStrategy
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

// ==================== CUSTOM BENCHMARKS ====================

/**
 * A reference portfolio the user assembled themselves, to measure simulations
 * against something the curated catalog does not cover — a personal holding, a
 * competitor's fund, or a home-currency blend of indices.
 */
export const customBenchmarks = sqliteTable(
  "custom_benchmarks",
  {
    id: text("id").primaryKey(), // UUID
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** JSON string: [{ ticker, weight }] — weights are literal exposures. */
    components: text("components").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (table) => ({
    userIdx: index("custom_benchmarks_user_idx").on(table.userId),
  })
);

// ==================== SCHEDULED SIMULATIONS ====================

/**
 * A recurring re-run of one or more saved simulations, delivered as a single
 * email digest. Each run replays a simulation's stored params with the end date
 * moved to the current month (see `CRON.md`).
 */
export const simulationSchedules = sqliteTable(
  "simulation_schedules",
  {
    id: text("id").primaryKey(), // UUID
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name"),
    cadence: text("cadence").notNull(), // daily | weekly | monthly
    /** 0 (Sunday) – 6 (Saturday); weekly only. */
    dayOfWeek: integer("day_of_week"),
    /** 1–28 only, so every month has the day; monthly only. */
    dayOfMonth: integer("day_of_month"),
    /** IANA zone the day boundaries are computed in. Not a delivery hour. */
    timezone: text("timezone").notNull().default("UTC"),
    /** Captured at creation: a cron run has no request to read the locale cookie from. */
    locale: text("locale").notNull().default("es"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    nextRunAt: integer("next_run_at", { mode: "timestamp" }).notNull(),
    lastRunAt: integer("last_run_at", { mode: "timestamp" }),
    /** Consecutive runs skipped for lack of credits; drives the auto-pause. */
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [
    index("simulation_schedules_due_idx").on(t.active, t.nextRunAt),
    index("simulation_schedules_user_idx").on(t.userId),
  ]
);

export const scheduleSimulations = sqliteTable(
  "schedule_simulations",
  {
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => simulationSchedules.id, { onDelete: "cascade" }),
    simulationId: text("simulation_id")
      .notNull()
      .references(() => simulations.id, { onDelete: "cascade" }),
  },
  (t) => [
    unique("schedule_simulation_unique").on(t.scheduleId, t.simulationId),
    index("schedule_simulations_simulation_idx").on(t.simulationId),
  ]
);

/**
 * One execution of a simulation, kept so a run can be diffed against the one
 * before it. `params` is snapshotted per run: the lookback window grows as the
 * end date moves forward, so two runs of the same simulation differ in inputs.
 */
export const simulationRuns = sqliteTable(
  "simulation_runs",
  {
    id: text("id").primaryKey(), // UUID
    simulationId: text("simulation_id")
      .notNull()
      .references(() => simulations.id, { onDelete: "cascade" }),
    /** Null for a run that did not come from a schedule. */
    scheduleId: text("schedule_id").references(() => simulationSchedules.id, {
      onDelete: "set null",
    }),
    params: text("params").notNull(), // JSON string
    result: text("result"), // JSON string; null when the run failed
    status: text("status").notNull(), // success | failed
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("simulation_runs_simulation_idx").on(t.simulationId, t.createdAt)]
);

// ==================== BILLING ====================

export const walletBalance = sqliteTable("wallet_balance", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  credits: integer("credits").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const creditPackages = sqliteTable("credit_packages", {
  id: text("id").primaryKey(),
  credits: integer("credits").notNull(),
  priceMinor: integer("price_minor").notNull(),
  currency: text("currency").notNull(),
  rail: text("rail").notNull(),
  stripePriceId: text("stripe_price_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    packageId: text("package_id").references(() => creditPackages.id),
    rail: text("rail").notNull(),
    externalId: text("external_id").unique(),
    status: text("status").notNull().default("pending"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    creditsPurchased: integer("credits_purchased").notNull(),
    metadata: text("metadata"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (t) => [index("payments_user_idx").on(t.userId)]
);

export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(), // 'purchase' | 'spend' | 'grant' | 'reversal'
    paymentId: text("payment_id").references(() => payments.id),
    simulationId: text("simulation_id").references(() => simulations.id),
    idempotencyKey: text("idempotency_key").unique(),
    balanceAfter: integer("balance_after").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [index("ledger_user_idx").on(t.userId), index("ledger_created_idx").on(t.createdAt)]
);

// ==================== RELATIONS ====================

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  assumptions: many(userAssumptions),
  correlations: many(userCorrelations),
  simulations: many(simulations),
  customBenchmarks: many(customBenchmarks),
  simulationSchedules: many(simulationSchedules),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const simulationsRelations = relations(simulations, ({ one }) => ({
  user: one(user, {
    fields: [simulations.userId],
    references: [user.id],
  }),
}));

export const customBenchmarksRelations = relations(customBenchmarks, ({ one }) => ({
  user: one(user, {
    fields: [customBenchmarks.userId],
    references: [user.id],
  }),
}));

export const fundsRelations = relations(funds, ({ many }) => ({
  prices: many(prices),
}));

export const pricesRelations = relations(prices, ({ one }) => ({
  fund: one(funds, {
    fields: [prices.fundId],
    references: [funds.id],
  }),
}));

export const userAssumptionsRelations = relations(userAssumptions, ({ one }) => ({
  user: one(user, {
    fields: [userAssumptions.userId],
    references: [user.id],
  }),
  fund: one(funds, {
    fields: [userAssumptions.fundId],
    references: [funds.id],
  }),
}));

export const userCorrelationsRelations = relations(userCorrelations, ({ one }) => ({
  user: one(user, {
    fields: [userCorrelations.userId],
    references: [user.id],
  }),
}));

export const userProfileRelations = relations(userProfile, ({ one }) => ({
  user: one(user, {
    fields: [userProfile.userId],
    references: [user.id],
  }),
}));

export const walletBalanceRelations = relations(walletBalance, ({ one }) => ({
  user: one(user, {
    fields: [walletBalance.userId],
    references: [user.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  user: one(user, {
    fields: [payments.userId],
    references: [user.id],
  }),
  package: one(creditPackages, {
    fields: [payments.packageId],
    references: [creditPackages.id],
  }),
  ledgerRows: many(creditLedger),
}));

export const simulationSchedulesRelations = relations(simulationSchedules, ({ one, many }) => ({
  user: one(user, {
    fields: [simulationSchedules.userId],
    references: [user.id],
  }),
  simulations: many(scheduleSimulations),
}));

export const scheduleSimulationsRelations = relations(scheduleSimulations, ({ one }) => ({
  schedule: one(simulationSchedules, {
    fields: [scheduleSimulations.scheduleId],
    references: [simulationSchedules.id],
  }),
  simulation: one(simulations, {
    fields: [scheduleSimulations.simulationId],
    references: [simulations.id],
  }),
}));

export const simulationRunsRelations = relations(simulationRuns, ({ one }) => ({
  simulation: one(simulations, {
    fields: [simulationRuns.simulationId],
    references: [simulations.id],
  }),
  schedule: one(simulationSchedules, {
    fields: [simulationRuns.scheduleId],
    references: [simulationSchedules.id],
  }),
}));

export const creditLedgerRelations = relations(creditLedger, ({ one }) => ({
  user: one(user, {
    fields: [creditLedger.userId],
    references: [user.id],
  }),
  payment: one(payments, {
    fields: [creditLedger.paymentId],
    references: [payments.id],
  }),
  simulation: one(simulations, {
    fields: [creditLedger.simulationId],
    references: [simulations.id],
  }),
}));

// ==================== TYPES ====================

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;

export type Fund = typeof funds.$inferSelect;
export type NewFund = typeof funds.$inferInsert;

export type Price = typeof prices.$inferSelect;
export type NewPrice = typeof prices.$inferInsert;

export type FundExposure = typeof fundExposures.$inferSelect;
export type IndexDataRow = typeof indexData.$inferSelect;

export type UserAssumption = typeof userAssumptions.$inferSelect;
export type UserCorrelation = typeof userCorrelations.$inferSelect;

export type BackgroundTask = typeof backgroundTasks.$inferSelect;
export type NewBackgroundTask = typeof backgroundTasks.$inferInsert;

export type Simulation = typeof simulations.$inferSelect;
export type NewSimulation = typeof simulations.$inferInsert;

export type CustomBenchmark = typeof customBenchmarks.$inferSelect;
export type NewCustomBenchmark = typeof customBenchmarks.$inferInsert;

export type SimulationSchedule = typeof simulationSchedules.$inferSelect;
export type NewSimulationSchedule = typeof simulationSchedules.$inferInsert;
export type SimulationRun = typeof simulationRuns.$inferSelect;
export type NewSimulationRun = typeof simulationRuns.$inferInsert;

export type UserProfile = typeof userProfile.$inferSelect;
export type NewUserProfile = typeof userProfile.$inferInsert;

export type WalletBalance = typeof walletBalance.$inferSelect;
export type CreditPackage = typeof creditPackages.$inferSelect;
export type NewCreditPackage = typeof creditPackages.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;
export type NewCreditLedgerRow = typeof creditLedger.$inferInsert;
