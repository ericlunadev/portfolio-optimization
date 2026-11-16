#!/usr/bin/env node
// Mock data for the Brio Valores demo tenant: saved simulations, sharing, a
// pin and a monthly schedule, created through the real API rather than written
// into SQLite by hand.
//
// Why the API: a simulation row stores the optimizer's whole response (weights,
// covariance matrix, risk stats). A hand-written one would drift from what the
// results page reads the first time that shape changes; this one cannot. It also
// spends credits through the metering path, so /billing's per-member usage is
// real ledger data.
//
// Needs network: /optimize pulls prices from Yahoo Finance. A simulation that
// fails is reported and skipped; the rest still land.
//
// Usage: node seed-brio.mjs <api-base> <origin> <password> <owner-email> <member-email>
// run.sh calls it from `up`, after both members exist and the tenant is funded.

const [api, origin, password, ownerEmail, memberEmail] = process.argv.slice(2);
if (!api || !origin || !password || !ownerEmail || !memberEmail) {
  console.error("usage: seed-brio.mjs <api-base> <origin> <password> <owner-email> <member-email>");
  process.exit(2);
}

// Monthly windows as the web form stores them (SimulationParams.dateRange).
const RANGE = { startMonth: 1, startYear: 2021, endMonth: 10, endYear: 2026 };

// Instruments Brio's clients actually trade from Argentina: the local
// companies' NYSE ADRs, and the US names and ETFs behind the most-held CEDEARs.
const SIMULATIONS = [
  {
    by: "owner",
    name: "Cartera Agresiva — ADRs argentinos",
    tickers: ["GGAL", "BMA", "YPF", "VIST", "PAM", "MELI"],
    strategy: "max-sharpe",
    riskFreeRate: 0.045,
    wMax: 0.35,
    pinned: true,
    benchmarks: [],
  },
  {
    by: "owner",
    name: "Conservadora en dólares",
    tickers: ["TLT", "EMB", "GLD", "SPY", "KO"],
    strategy: "min-risk",
    sharedWithOrg: true,
  },
  {
    by: "owner",
    name: "CEDEARs Tecnología",
    tickers: ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "MELI"],
    strategy: "risk-parity",
  },
  {
    by: "owner",
    name: "Energía — Vaca Muerta",
    tickers: ["YPF", "VIST", "PAM", "TGS", "CEPU"],
    strategy: "hrp",
  },
  {
    by: "member",
    name: "Moderada global (cliente institucional)",
    tickers: ["SPY", "EEM", "ARGT", "EMB", "GLD"],
    strategy: "target-risk",
    targetRisk: 0.15,
    sharedWithOrg: true,
  },
  {
    by: "member",
    name: "Dividendos defensivos",
    tickers: ["KO", "PG", "JNJ", "PEP", "WMT"],
    strategy: "equal-weight",
  },
];

// The tickers each schedule re-runs, by simulation name. Owner's only: a shared
// simulation is readable by colleagues but not schedulable.
const SCHEDULE = {
  name: "Revisión mensual de carteras",
  cadence: "monthly",
  dayOfMonth: 1,
  timezone: "America/Argentina/Buenos_Aires",
  locale: "es",
  simulations: ["Cartera Agresiva — ADRs argentinos", "CEDEARs Tecnología"],
};

function isoDates({ startMonth, startYear, endMonth, endYear }) {
  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  return {
    start_date: `${startYear}-${pad(startMonth)}-01`,
    end_date: `${endYear}-${pad(endMonth)}-${pad(lastDay)}`,
  };
}

async function signIn(email) {
  const res = await fetch(`${api}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in for ${email} returned ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .find((pair) => pair.startsWith("better-auth.session_token="));
  if (!cookie) throw new Error(`sign-in for ${email} set no session cookie`);
  return cookie;
}

async function call(cookie, method, path, body) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** Same request the web form sends, and the same `SimulationParams` it saves. */
async function createSimulation(cookie, spec) {
  const wMax = spec.wMax ?? 1;
  const result = await call(cookie, "POST", "/api/optimization/optimize", {
    tickers: spec.tickers,
    strategy: spec.strategy,
    w_max: wMax,
    risk_free_rate: spec.riskFreeRate ?? 0,
    target_return: spec.targetReturn,
    target_risk: spec.targetRisk,
    ...isoDates(RANGE),
    enforce_full_investment: true,
    allow_short_selling: false,
    max_leverage: 1,
  });

  const params = {
    tickers: spec.tickers,
    assets: spec.tickers.map((ticker) => ({ ticker, allocation: null, minWeight: null, maxWeight: null })),
    dateRange: RANGE,
    strategy: spec.strategy,
    ...(spec.targetReturn !== undefined && { targetReturn: spec.targetReturn }),
    ...(spec.targetRisk !== undefined && { targetRisk: spec.targetRisk }),
    riskFreeRate: spec.riskFreeRate ?? 0,
    enforceFullInvestment: true,
    allowShortSelling: false,
    useLeverage: false,
    maxLeverage: 1,
    assetConstraints: wMax < 1,
    wMax,
    assetLimits: false,
    showFrontier: true,
    benchmarks: spec.benchmarks ?? [],
  };

  const saved = await call(cookie, "POST", "/api/simulations", { name: spec.name, params, result });
  const flags = {
    ...(spec.pinned && { pinned: true }),
    ...(spec.sharedWithOrg && { sharedWithOrg: true }),
  };
  // The results page computes the frontier on first open and caches it on the
  // row; doing it here means the demo opens with the curve already drawn.
  await call(cookie, "POST", `/api/optimization/simulations/${saved.id}/frontier`, {});

  if (Object.keys(flags).length > 0) {
    await call(cookie, "PATCH", `/api/simulations/${saved.id}`, flags);
  }
  return saved.id;
}

async function main() {
  const cookies = { owner: await signIn(ownerEmail), member: await signIn(memberEmail) };
  const ids = new Map();
  let failed = 0;

  for (const spec of SIMULATIONS) {
    try {
      ids.set(spec.name, await createSimulation(cookies[spec.by], spec));
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${spec.name}: ${error.message}`);
    }
  }

  const scheduled = SCHEDULE.simulations.map((name) => ids.get(name)).filter(Boolean);
  if (scheduled.length > 0) {
    const { simulations: _names, ...timing } = SCHEDULE;
    await call(cookies.owner, "POST", "/api/schedules", { ...timing, simulationIds: scheduled });
  }

  console.log(
    `✓ brio mock data: ${ids.size}/${SIMULATIONS.length} simulations` +
      (scheduled.length > 0 ? `, 1 monthly schedule over ${scheduled.length}` : "") +
      (failed > 0 ? ` (${failed} failed — Yahoo Finance reachable?)` : "")
  );
}

main().catch((error) => {
  console.error(`✗ brio mock data: ${error.message}`);
  process.exit(1);
});
