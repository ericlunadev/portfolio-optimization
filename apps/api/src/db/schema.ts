import { sqliteTable, text, integer, real, unique, index } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

// ==================== AUTH ====================

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    name: text("name"),
    pictureUrl: text("picture_url"),
    provider: text("provider").notNull(),
    providerId: text("provider_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
    lastLogin: integer("last_login", { mode: "timestamp" }),
  },
  (t) => [unique("provider_unique").on(t.provider, t.providerId), index("email_idx").on(t.email)]
);

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
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
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
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

// ==================== TASKS ====================

export const backgroundTasks = sqliteTable("background_tasks", {
  id: text("id").primaryKey(), // UUID
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  taskType: text("task_type").notNull(),
  status: text("status").notNull().default("pending"), // pending, running, completed, failed, cancelled
  progress: real("progress").default(0),
  resultData: text("result_data"), // JSON string
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ==================== RELATIONS ====================

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  assumptions: many(userAssumptions),
  correlations: many(userCorrelations),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
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
  user: one(users, {
    fields: [userAssumptions.userId],
    references: [users.id],
  }),
  fund: one(funds, {
    fields: [userAssumptions.fundId],
    references: [funds.id],
  }),
}));

export const userCorrelationsRelations = relations(userCorrelations, ({ one }) => ({
  user: one(users, {
    fields: [userCorrelations.userId],
    references: [users.id],
  }),
}));

// ==================== TYPES ====================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;

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
