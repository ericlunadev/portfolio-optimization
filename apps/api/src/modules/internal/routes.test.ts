import { beforeEach, describe, expect, it, vi } from "vitest";

const { runDueSchedules } = vi.hoisted(() => {
  process.env.INTERNAL_API_SECRET = "s".repeat(40);
  return { runDueSchedules: vi.fn() };
});

vi.mock("../schedules/runner.js", () => ({ runDueSchedules }));

const { default: internal, isAuthorized } = await import("./routes.js");

describe("isAuthorized", () => {
  it("accepts only the exact bearer secret", () => {
    const secret = "s".repeat(40);
    expect(isAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorized(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorized(secret, secret)).toBe(false);
    expect(isAuthorized(undefined, secret)).toBe(false);
    // An unconfigured secret never matches, not even an empty bearer.
    expect(isAuthorized("Bearer ", undefined)).toBe(false);
  });
});

describe("POST /run-schedules", () => {
  beforeEach(() => {
    runDueSchedules.mockReset().mockResolvedValue({});
  });

  it("rejects a wrong secret without running anything", async () => {
    const res = await internal.request("/run-schedules", {
      method: "POST",
      headers: { Authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
    expect(runDueSchedules).not.toHaveBeenCalled();
  });

  it("accepts immediately and runs in the background", async () => {
    let finish: () => void = () => {};
    runDueSchedules.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const request = () =>
      internal.request("/run-schedules", {
        method: "POST",
        headers: { Authorization: `Bearer ${"s".repeat(40)}` },
      });

    const first = await request();
    expect(first.status).toBe(202);
    // Still running: a retry does not start a second batch.
    expect(await (await request()).json()).toMatchObject({ alreadyRunning: true });
    expect(runDueSchedules).toHaveBeenCalledTimes(1);
    finish();
  });
});
