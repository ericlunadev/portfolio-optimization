// Bug B5: `Idempotency-Key` was missing from the CORS allowlist while both the
// web client and the mobile client send it on POST /api/billing/advisor-call, so
// the preflight failed on a paid endpoint. The allowlist is a literal array
// nobody re-reads, which is exactly the kind of fix that regresses unnoticed.

import { describe, expect, it } from "vitest";
import app from "../app.js";
import { env } from "../config/env.js";

describe("CORS preflight", () => {
  it("allows the Idempotency-Key header", async () => {
    const response = await app.fetch(
      new Request(new URL("/api/billing/advisor-call", "http://api.test"), {
        method: "OPTIONS",
        headers: {
          Origin: env.FRONTEND_URL,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "idempotency-key",
        },
      })
    );

    const allowed = response.headers.get("access-control-allow-headers") ?? "";
    expect(allowed.toLowerCase()).toContain("idempotency-key");
  });
});
