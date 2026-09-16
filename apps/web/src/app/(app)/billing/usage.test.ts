// PLAN Task 2.4 — the decisions the usage view takes from the API's answer.
//
// The one with teeth is the labelling of rows with no user. `credit_ledger`
// leaves `user_id` null for two unrelated reasons — an operator grant, which
// never had a user, and a deleted analyst, whose rows outlived them — and those
// rows are invisible in every member's personal ledger while still counting in
// the balance. Calling both of them "former member" would put that label on a
// top-up we wrote ourselves.

import { describe, expect, it } from "vitest";
import en from "@/../messages/en.json";
import es from "@/../messages/es.json";
import {
  actorKey,
  formatDelta,
  formatUsageDate,
  memberName,
  unattributedKey,
  type UsageMember,
} from "./usage";

function member(overrides: Partial<UsageMember> = {}): UsageMember {
  return {
    userId: "user-1",
    name: "Ana Ruiz",
    email: "ana@acme.test",
    role: "member",
    isCurrentMember: true,
    spent: 0,
    added: 0,
    runs: 0,
    simulations: 0,
    lastActivityAt: null,
    ...overrides,
  };
}

describe("unattributedKey", () => {
  it("labels a bucket that only ever received credits as a top-up", () => {
    expect(unattributedKey({ spent: 0, runs: 0 })).toBe("usagePlatformGrant");
  });

  it("labels a bucket that spent credits as a former member", () => {
    expect(unattributedKey({ spent: 12, runs: 4 })).toBe("usageFormerMember");
  });

  // A refund of a departed analyst's spend leaves the bucket at zero net credits
  // but with runs behind it — still a person, not a grant.
  it("counts runs, not just the credit total", () => {
    expect(unattributedKey({ spent: 0, runs: 2 })).toBe("usageFormerMember");
  });
});

describe("actorKey", () => {
  it("returns null when the row has an actor to name", () => {
    expect(actorKey({ reason: "spend", actor: { name: "Ana Ruiz" } })).toBeNull();
  });

  it("labels an unattributed spend as a former member", () => {
    expect(actorKey({ reason: "spend", actor: null })).toBe("usageFormerMember");
  });

  it("labels an unattributed grant or purchase as a top-up", () => {
    expect(actorKey({ reason: "grant", actor: null })).toBe("usagePlatformGrant");
    expect(actorKey({ reason: "purchase", actor: null })).toBe("usagePlatformGrant");
  });
});

describe("memberName", () => {
  it("prefers the name", () => {
    expect(memberName(member())).toBe("Ana Ruiz");
  });

  it("falls back to the address we know them by", () => {
    expect(memberName(member({ name: null }))).toBe("ana@acme.test");
  });

  it("returns null for the row that belongs to nobody", () => {
    expect(memberName(member({ userId: null, name: null, email: null }))).toBeNull();
  });
});

describe("formatUsageDate", () => {
  it("renders DD/MM/YYYY", () => {
    // Built in local time so the assertion does not depend on the runner's zone.
    expect(formatUsageDate(new Date(2026, 0, 5, 12).toISOString())).toBe("05/01/2026");
    expect(formatUsageDate(new Date(2026, 11, 31, 12).toISOString())).toBe("31/12/2026");
  });

  it("renders a dash for a seat that has done nothing yet", () => {
    expect(formatUsageDate(null)).toBe("—");
    expect(formatUsageDate("not a date")).toBe("—");
  });
});

describe("formatDelta", () => {
  it("signs a credit and leaves a debit as it is", () => {
    expect(formatDelta(100)).toBe("+100");
    expect(formatDelta(-3)).toBe("-3");
  });
});

// CLAUDE.md: every user-facing string exists in both locales. These are the keys
// this view reads that no other screen does.
describe("translations", () => {
  const keys = [
    "ledgerScopeNote",
    "usageTitle",
    "usageSubtitle",
    "usageLoading",
    "usageEmpty",
    "usageTotalSpent",
    "usageTotalAdded",
    "usageTotalRuns",
    "usageSeats",
    "usageColMember",
    "usageColSpent",
    "usageColRuns",
    "usageColSimulations",
    "usageColLastActivity",
    "usageActivityTitle",
    "usageColActor",
    "usageFormerMember",
    "usagePlatformGrant",
  ];

  it.each(keys)("has %s in both locales", (key) => {
    expect(es.Billing).toHaveProperty(key);
    expect(en.Billing).toHaveProperty(key);
  });
});
