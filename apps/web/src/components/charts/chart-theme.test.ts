import { describe, expect, it } from "vitest";
import { resolveChartColors } from "./chart-theme";
import { deriveTenantPalette } from "@/lib/tenant-palette";

// PLAN §3.3 — the chart series are one of the three palettes fed by the tenant
// accent. `useChartColors` is the hook around this function; the function is
// what carries the decisions worth pinning.

const TENANT_ACCENT = "#2f6f4f";

describe("resolveChartColors", () => {
  it("keeps the shipped sets when the tenant has no accent", () => {
    for (const theme of ["light", "dark"] as const) {
      const house = resolveChartColors(null, theme);

      // The gold slot is the one a tenant would take over, so it is the one
      // worth asserting has not moved for the D2C product.
      expect(house.palette[0].name).toBe("gold");
      expect(house.optimal).toBe(theme === "dark" ? "#e0a861" : "#8a6224");
      expect(house.palette[3]).toEqual(
        theme === "dark"
          ? { name: "amber", stroke: "#fbbf24", solid: "#f59e0b", soft: "#fde68a" }
          : { name: "amber", stroke: "#d97706", solid: "#b45309", soft: "#fcd34d" }
      );
    }
  });

  it("treats an unusable accent as no accent", () => {
    expect(resolveChartColors("chartreuse", "dark")).toEqual(
      resolveChartColors(null, "dark")
    );
    expect(resolveChartColors(undefined, "light")).toEqual(
      resolveChartColors(null, "light")
    );
  });

  it("takes the derived set when the tenant has an accent", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(resolveChartColors(TENANT_ACCENT, theme)).toEqual(
        deriveTenantPalette(TENANT_ACCENT).charts[theme]
      );
      expect(resolveChartColors(TENANT_ACCENT, theme).optimal).not.toBe(
        resolveChartColors(null, theme).optimal
      );
    }
  });

  it("still emits real hex, which is what the alpha-concatenating call sites need", () => {
    const colors = resolveChartColors(TENANT_ACCENT, "dark");
    const hex = /^#[0-9a-f]{6}$/;

    expect(colors.optimal).toMatch(hex);
    expect(colors.danger).toMatch(hex);
    colors.benchmarks.forEach((color) => expect(color).toMatch(hex));
    colors.palette.forEach((entry) => {
      expect(entry.stroke).toMatch(hex);
      expect(entry.solid).toMatch(hex);
      expect(entry.soft).toMatch(hex);
    });
  });

  it("leaves the semantic colours alone for a red-branded tenant (D10)", () => {
    const red = resolveChartColors("#c81e1e", "dark");

    expect(red.danger).toBe(resolveChartColors(null, "dark").danger);
    expect(red.optimal).not.toBe(red.danger);
  });
});
