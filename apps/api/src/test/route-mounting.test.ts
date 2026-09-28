// Every router must be reachable on the *composed* app.
//
// This exists because two routers shipped fully built and fully unit-tested but
// never mounted: their own tests mounted them into a throwaway `new Hono()`, so
// the suite was green while `GET /api/tenants/by-host` returned 404 in
// production and the whole of host-based tenant resolution was inert. A test
// that mounts its subject cannot catch that; only one that drives `app.fetch`
// can.
//
// The assertion is deliberately weak — "not 404" — because what is being pinned
// is the wiring, not the handler. Auth and validation are covered by each
// router's own tests.

import { describe, expect, it } from "vitest";
import app from "../app.js";
import { asUser, seedUser } from "./factories.js";

const ORIGIN = "http://api.test";

async function status(path: string): Promise<number> {
  const response = await app.fetch(new Request(new URL(path, ORIGIN)));
  return response.status;
}

describe("route mounting", () => {
  it("serves the health check", async () => {
    expect(await status("/api/health")).toBe(200);
  });

  it.each([
    // Unauthenticated by design: the web layer needs branding before login.
    ["/api/tenants/by-host?host=example.test", "tenant resolution by host"],
    ["/api/organizations/branding/settings", "the branding settings endpoint"],
    ["/api/organizations/export", "the org data export"],
    ["/api/billing/wallet", "the wallet"],
    ["/api/simulations", "simulations"],
    ["/api/onboarding", "onboarding"],
    ["/api/market/risk-free-rates", "market rates"],
    ["/api/historical/search?q=SPY", "ticker search"],
    ["/api/optimization/benchmarks", "the benchmark catalog"],
  ])("mounts %s (%s)", async (path) => {
    expect(await status(path)).not.toBe(404);
  });

  // Custom benchmarks are a router mounted *inside* the optimization router, so
  // an anonymous request proves nothing: the parent's wildcard authMiddleware
  // answers 401 before routing reaches the child, mounted or not. Signed in, an
  // unmounted child falls through to 404 while a mounted one rejects the empty
  // body in its validator.
  it("mounts /api/optimization/custom-benchmarks (custom benchmarks)", async () => {
    const fetchAs = asUser(await seedUser());
    const response = await fetchAs("/api/optimization/custom-benchmarks", {
      method: "POST",
      json: {},
    });
    expect(response.status).not.toBe(404);
  });

  // `by-host` must not sit under /api/organizations: that prefix registers a
  // wildcard authMiddleware, which would 401 a lookup the web layer has to make
  // before anyone is signed in.
  it("keeps tenant resolution outside the authenticated organizations prefix", async () => {
    expect(await status("/api/tenants/by-host?host=example.test")).not.toBe(401);
  });
});
