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
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

// ==================== RELATIONS ====================

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  assumptions: many(userAssumptions),
  correlations: many(userCorrelations),
  simulations: many(simulations),
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

export type UserProfile = typeof userProfile.$inferSelect;
export type NewUserProfile = typeof userProfile.$inferInsert;
