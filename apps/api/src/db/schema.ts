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

// ==================== ORGANIZATIONS (Whitelabel tenancy) ====================

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(), // UUID
  slug: text("slug").notNull().unique(), // internal identifier — NOT the subdomain
  name: text("name").notNull(),
  tier: text("tier").notNull().default("cobranded"), // 'cobranded' | 'whitelabel'
  // The D2C tenant. The web middleware falls back to this org for unknown hosts.
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  // `logo` and `metadata` are unused today. They exist so that adopting BetterAuth's
  // organization plugin later stays a purely additive change.
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const organizationMember = sqliteTable(
  "organization_member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // 'owner' | 'member'
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (t) => [
    // One user belongs to exactly one organization: there is no org switcher.
    unique("org_member_user_unique").on(t.userId),
    index("org_member_org_idx").on(t.organizationId),
  ]
);

export const organizationBranding = sqliteTable("organization_branding", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  productName: text("product_name"),
  productShortName: text("product_short_name"),
  tagline: text("tagline"),
  accentHex: text("accent_hex"), // the only colour input a tenant gets
  fontKey: text("font_key").default("instrument-sans"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  // Nullable for the first release: no support address, privacy policy or terms
  // exist anywhere in the repo yet, so `.notNull()` would make the backfill
  // unwritable. The provisioning CLI enforces them instead.
  supportEmail: text("support_email"),
  privacyPolicyUrl: text("privacy_policy_url"),
  termsUrl: text("terms_url"),
  disclaimerText: text("disclaimer_text"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const organizationDomain = sqliteTable(
  "organization_domain",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("org_domain_host_idx").on(t.hostname)]
);

export const organizationSettings = sqliteTable("organization_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  academiaEnabled: integer("academia_enabled", { mode: "boolean" }).notNull().default(true),
  advisorMode: text("advisor_mode").notNull().default("off"), // 'off' | 'platform' | 'tenant'
  advisorBookingUrl: text("advisor_booking_url"),
  advisorCostCredits: integer("advisor_cost_credits").default(100),
  cryptoRailEnabled: integer("crypto_rail_enabled", { mode: "boolean" }).notNull().default(false),
  fundAllowlist: text("fund_allowlist"), // JSON array; NULL or empty = unrestricted
  overdraftLimit: integer("overdraft_limit").notNull().default(0),
  signupGrantCredits: integer("signup_grant_credits").notNull().default(3),
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
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    fundId: integer("fund_id")
      .notNull()
      .references(() => funds.id, { onDelete: "cascade" }),
    expRet: real("exp_ret"),
    volatility: real("volatility"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [
    unique("user_fund_unique").on(t.userId, t.fundId),
    index("user_assumptions_org_idx").on(t.organizationId),
  ]
);

export const userCorrelations = sqliteTable(
  "user_correlations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    fundId1: integer("fund_id_1")
      .notNull()
      .references(() => funds.id),
    fundId2: integer("fund_id_2")
      .notNull()
      .references(() => funds.id),
    correlation: real("correlation").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [
    unique("user_corr_unique").on(t.userId, t.fundId1, t.fundId2),
    index("user_correlations_org_idx").on(t.organizationId),
  ]
);

// ==================== USER PROFILE (Onboarding) ====================

export const userProfile = sqliteTable(
  "user_profile",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),

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
  },
  (t) => [index("user_profile_org_idx").on(t.organizationId)]
);

// ==================== TASKS ====================

export const backgroundTasks = sqliteTable(
  "background_tasks",
  {
    id: text("id").primaryKey(), // UUID
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    taskType: text("task_type").notNull(),
    status: text("status").notNull().default("pending"), // pending, running, completed, failed, cancelled
    progress: real("progress").default(0),
    resultData: text("result_data"), // JSON string
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (t) => [index("background_tasks_org_idx").on(t.organizationId)]
);

// ==================== SIMULATIONS ====================

export const simulations = sqliteTable(
  "simulations",
  {
    id: text("id").primaryKey(), // UUID
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name"),
    params: text("params").notNull(), // JSON string with SimulationParams
    result: text("result").notNull(), // JSON string with OptimizationResultWithStrategy
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    // Grants the rest of the org read access, never write.
    sharedWithOrg: integer("shared_with_org", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [index("simulations_org_idx").on(t.organizationId)]
);

// ==================== BILLING ====================

// Keyed on the organization: one wallet per tenant, with per-user attribution in
// `credit_ledger`. `userId` is deprecated and survives only so the release still
// serving traffic during Deploy 2's build — which spends with a raw
// `WHERE user_id = ?` — does not 5xx. Drop it in a later cleanup migration.
export const walletBalance = sqliteTable("wallet_balance", {
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
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
    // `no action`: a financial record must not disappear with its organization.
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "no action" }),
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
  (t) => [index("payments_user_idx").on(t.userId), index("payments_org_idx").on(t.organizationId)]
);

export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    // Nullable `set null`: deleting one departing analyst must not delete the
    // ledger rows behind their organization's wallet balance, and a
    // platform-level admin grant has no acting user at all.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    // `no action`: a financial record must not disappear with its organization.
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "no action" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(), // 'purchase' | 'spend' | 'grant' | 'reversal'
    paymentId: text("payment_id").references(() => payments.id),
    simulationId: text("simulation_id").references(() => simulations.id),
    idempotencyKey: text("idempotency_key"),
    balanceAfter: integer("balance_after").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  },
  (t) => [
    index("ledger_user_idx").on(t.userId),
    index("ledger_created_idx").on(t.createdAt),
    index("ledger_org_idx").on(t.organizationId),
    // Scoped, not global: `idempotency_key` is a raw client header and two
    // server-written formats are guessable, so a global unique index let any
    // caller replay another tenant's spend.
    unique("ledger_org_idempotency_unique").on(t.organizationId, t.idempotencyKey),
  ]
);

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

export const walletBalanceRelations = relations(walletBalance, ({ one }) => ({
  organization: one(organization, {
    fields: [walletBalance.organizationId],
    references: [organization.id],
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

export type Organization = typeof organization.$inferSelect;
export type NewOrganization = typeof organization.$inferInsert;
export type OrganizationMember = typeof organizationMember.$inferSelect;
export type NewOrganizationMember = typeof organizationMember.$inferInsert;
export type OrganizationBranding = typeof organizationBranding.$inferSelect;
export type NewOrganizationBranding = typeof organizationBranding.$inferInsert;
export type OrganizationDomain = typeof organizationDomain.$inferSelect;
export type NewOrganizationDomain = typeof organizationDomain.$inferInsert;
export type OrganizationSettings = typeof organizationSettings.$inferSelect;
export type NewOrganizationSettings = typeof organizationSettings.$inferInsert;

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

export type WalletBalance = typeof walletBalance.$inferSelect;
export type CreditPackage = typeof creditPackages.$inferSelect;
export type NewCreditPackage = typeof creditPackages.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;
export type NewCreditLedgerRow = typeof creditLedger.$inferInsert;
