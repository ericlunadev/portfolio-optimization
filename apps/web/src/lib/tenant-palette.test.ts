import { describe, expect, it } from "vitest";
import type { ChartColors } from "@/components/charts/chart-theme";
import type { ResolvedTheme } from "@/lib/theme";
import {
  contrastRatio,
  DEFAULT_ACCENT_HEX,
  deriveTenantPalette,
  isValidAccentHex,
  MIN_CONTRAST,
  MIN_LARGE_TEXT_CONTRAST,
  normalizeAccentHex,
  TenantCssVariable,
  THEME_BACKGROUND_HEX,
} from "./tenant-palette";

/*
 * The colour maths below is written a second time, deliberately: reusing the
 * module's own converters would make every assertion agree with itself. These
 * use the CSS-spec `f(n)` formulation rather than the sector formulation the
 * module uses, so a mistake in one does not hide in the other.
 */

function channelsToHex(channels: string): string {
  const match = channels.match(/^(\d+) (\d+)% (\d+)%/);
  if (!match) throw new Error(`not HSL channels: ${channels}`);
  const [h, s, l] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function parseChannels(channels: string) {
  const match = channels.match(/^(\d+) (\d+)% (\d+)%/);
  if (!match) throw new Error(`not HSL channels: ${channels}`);
  return { h: Number(match[1]), s: Number(match[2]), l: Number(match[3]) };
}

function toHsl(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = ((max + min) / 2) * 100;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = (delta / (1 - Math.abs((2 * l) / 100 - 1))) * 100;
  const h =
    max === r
      ? ((g - b) / delta) * 60
      : max === g
        ? (((b - r) / delta) * 60 + 120)
        : (((r - g) / delta) * 60 + 240);
  return { h: ((h % 360) + 360) % 360, s, l };
}

/** Shortest distance between two hues, in [0, 180]. */
function hueGap(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/**
 * A hue read back out of a hex is not the hue that went in: eight bits per
 * channel cannot land on every degree. Half a degree is the floor of that
 * round-trip, so band assertions allow for it rather than pretending otherwise.
 */
const HUE_ROUNDING = 0.5;

function contrastWithPage(hex: string, theme: ResolvedTheme): number {
  return contrastRatio(hex, THEME_BACKGROUND_HEX[theme]);
}

/** Every hex the chart set carries, flattened. */
function chartHexes(colors: ChartColors): string[] {
  return [
    ...colors.palette.flatMap((entry) => [entry.stroke, entry.solid, entry.soft]),
    colors.optimal,
    colors.user,
    colors.frontier,
    colors.asset,
    ...colors.benchmarks,
    colors.danger,
    colors.frontierFrom,
    colors.frontierTo,
    ...colors.optimalBar,
    ...colors.userBar,
    colors.markerOutline,
    colors.cursor,
  ];
}

const THEMES: ResolvedTheme[] = ["light", "dark"];

/**
 * The tenant colours worth losing sleep over, not a tour of pleasant brands.
 * Pale yellow is the classic unreadable-on-white case, red and crimson sit on
 * the loss semantic, emerald on the gain one, blue and violet collide with
 * shipped series, and the achromatic three have no hue to work with at all.
 */
const ACCENTS: [label: string, hex: string][] = [
  ["the house gold", DEFAULT_ACCENT_HEX],
  ["pale yellow", "#fff9b0"],
  ["pure red", "#ff0000"],
  ["crimson", "#dc143c"],
  ["emerald", "#10b981"],
  ["brand blue", "#1f6feb"],
  ["violet", "#7c3aed"],
  ["near black", "#050505"],
  ["near white", "#fefefe"],
  ["mid grey", "#808080"],
];

const CSS_VARIABLES: TenantCssVariable[] = [
  "--primary",
  "--primary-emphasis",
  "--ring",
  "--gradient-gold-from",
  "--gradient-gold-to",
  "--glow-strong",
  "--glow-soft",
];

/** `globals.css`, `.dark` block. The house accent has to reproduce it exactly. */
const GLOBALS_DARK: Record<TenantCssVariable, string> = {
  "--primary": "38 65% 55%",
  "--primary-emphasis": "38 65% 65%",
  "--ring": "38 65% 55%",
  "--gradient-gold-from": "38 60% 50%",
  "--gradient-gold-to": "38 85% 65%",
  "--glow-strong": "38 65% 55% / 0.15",
  "--glow-soft": "38 65% 55% / 0.05",
};

/** `globals.css`, `:root` block. */
const GLOBALS_LIGHT: Record<TenantCssVariable, string> = {
  "--primary": "38 62% 36%",
  "--primary-emphasis": "38 72% 27%",
  "--ring": "38 62% 40%",
  "--gradient-gold-from": "38 65% 34%",
  "--gradient-gold-to": "38 80% 46%",
  "--glow-strong": "38 62% 40% / 0.22",
  "--glow-soft": "38 62% 40% / 0.08",
};

describe("normalizeAccentHex", () => {
  it("canonicalises the shapes a branding form will actually receive", () => {
    expect(normalizeAccentHex("#D7A042")).toBe("#d7a042");
    expect(normalizeAccentHex("d7a042")).toBe("#d7a042");
    expect(normalizeAccentHex("  #d7a042  ")).toBe("#d7a042");
    expect(normalizeAccentHex("#abc")).toBe("#aabbcc");
    expect(normalizeAccentHex("ABC")).toBe("#aabbcc");
  });

  it("rejects anything that is not an opaque three or six digit hex", () => {
    for (const value of [
      "",
      "#",
      "#12345",
      "#1234567",
      "#d7a042ff", // eight digit: an accent with alpha is a mistake, not a colour
      "rebeccapurple",
      "rgb(215, 160, 66)",
      "#gggggg",
      null,
      undefined,
      42,
      {},
    ]) {
      expect(normalizeAccentHex(value)).toBeNull();
      expect(isValidAccentHex(value)).toBe(false);
    }
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG anchors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // Symmetric: the lighter colour is always the numerator.
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("reads the page colours straight off globals.css", () => {
    expect(THEME_BACKGROUND_HEX.light).toBe("#faf8f5"); // 40 30% 97%
    expect(THEME_BACKGROUND_HEX.dark).toBe("#0b0b0f"); // 230 15% 5%
  });
});

describe("deriveTenantPalette", () => {
  it("falls back to the house gold instead of throwing on bad input", () => {
    for (const value of [null, undefined, "", "not a colour", "#12345"]) {
      const palette = deriveTenantPalette(value as string | null | undefined);
      expect(palette.accent).toBe(DEFAULT_ACCENT_HEX);
      expect(palette.isFallback).toBe(true);
    }
  });

  it("keeps the tenant's colour, normalised, when it parses", () => {
    const palette = deriveTenantPalette("1F6FEB");
    expect(palette.accent).toBe("#1f6feb");
    expect(palette.isFallback).toBe(false);
  });

  it("is pure: the same accent derives the same palette", () => {
    expect(deriveTenantPalette("#1f6feb")).toEqual(deriveTenantPalette("#1f6feb"));
  });

  it("shorthand and longhand of the same colour derive the same palette", () => {
    expect(deriveTenantPalette("#abc")).toEqual(deriveTenantPalette("#aabbcc"));
  });
});

describe("CSS variables", () => {
  it.each(ACCENTS)("emits every token in both themes for %s", (_label, hex) => {
    const { variables } = deriveTenantPalette(hex);
    for (const theme of THEMES) {
      for (const name of CSS_VARIABLES) {
        expect(variables[theme][name]).toMatch(
          /^\d+ \d+% \d+%( \/ 0\.\d+)?$/
        );
      }
    }
  });

  it.each(ACCENTS)("gives the glows the ring's channels for %s", (_label, hex) => {
    const { variables } = deriveTenantPalette(hex);
    for (const theme of THEMES) {
      const ring = variables[theme]["--ring"];
      expect(variables[theme]["--glow-strong"]).toBe(
        `${ring} / ${theme === "light" ? 0.22 : 0.15}`
      );
      expect(variables[theme]["--glow-soft"]).toBe(
        `${ring} / ${theme === "light" ? 0.08 : 0.05}`
      );
    }
  });

  it("reproduces the shipped dark tokens exactly for the house accent", () => {
    expect(deriveTenantPalette(DEFAULT_ACCENT_HEX).variables.dark).toEqual(
      GLOBALS_DARK
    );
  });

  it("lands within a couple of points of the shipped light tokens", () => {
    const light = deriveTenantPalette(DEFAULT_ACCENT_HEX).variables.light;
    for (const name of [
      "--primary",
      "--primary-emphasis",
      "--ring",
      "--gradient-gold-from",
    ] as const) {
      const mine = parseChannels(light[name]);
      const shipped = parseChannels(GLOBALS_LIGHT[name]);
      expect(mine.h).toBe(shipped.h);
      expect(Math.abs(mine.s - shipped.s)).toBeLessThanOrEqual(3);
      expect(Math.abs(mine.l - shipped.l)).toBeLessThanOrEqual(3);
    }
  });

  it("darkens the light gradient's end past what globals.css ships, on purpose", () => {
    // The shipped stop misses even the large-text floor, and it paints display
    // headings. The derived one is pulled down until it clears 3:1.
    const shipped = channelsToHex(GLOBALS_LIGHT["--gradient-gold-to"]);
    expect(contrastWithPage(shipped, "light")).toBeLessThan(
      MIN_LARGE_TEXT_CONTRAST
    );

    const derived = deriveTenantPalette(DEFAULT_ACCENT_HEX).variables.light;
    expect(parseChannels(derived["--gradient-gold-to"]).l).toBeLessThan(
      parseChannels(GLOBALS_LIGHT["--gradient-gold-to"]).l
    );
  });

  it.each(ACCENTS)("steps the emphasis away from the page for %s", (_label, hex) => {
    const { variables } = deriveTenantPalette(hex);
    const light = variables.light;
    const dark = variables.dark;

    // Darker on light, brighter on dark — unless the primary is already pinned
    // to the end of the scale and has nowhere left to go.
    const lightPrimary = parseChannels(light["--primary"]);
    if (lightPrimary.l > 0) {
      expect(parseChannels(light["--primary-emphasis"]).l).toBeLessThan(
        lightPrimary.l
      );
    }
    const darkPrimary = parseChannels(dark["--primary"]);
    if (darkPrimary.l < 100) {
      expect(parseChannels(dark["--primary-emphasis"]).l).toBeGreaterThan(
        darkPrimary.l
      );
    }
  });
});

describe("rule 1 — contrast is fitted, never rejected", () => {
  it.each(ACCENTS)("clears 4.5:1 on --primary in both themes for %s", (_label, hex) => {
    const { variables } = deriveTenantPalette(hex);
    for (const theme of THEMES) {
      const primary = channelsToHex(variables[theme]["--primary"]);
      expect(contrastWithPage(primary, theme)).toBeGreaterThanOrEqual(
        MIN_CONTRAST
      );
    }
  });

  it.each(ACCENTS)("clears the large-text floor on the ring and gradient for %s", (_label, hex) => {
    const { variables } = deriveTenantPalette(hex);
    for (const theme of THEMES) {
      for (const name of [
        "--ring",
        "--gradient-gold-from",
        "--gradient-gold-to",
      ] as const) {
        const color = channelsToHex(variables[theme][name]);
        expect(contrastWithPage(color, theme)).toBeGreaterThanOrEqual(
          MIN_LARGE_TEXT_CONTRAST
        );
      }
    }
  });

  it.each(ACCENTS)("moves no further than it has to for %s", (_label, hex) => {
    const { accent, variables } = deriveTenantPalette(hex);
    const accentL = Math.round(toHsl(accent).l);

    for (const theme of THEMES) {
      const primary = parseChannels(variables[theme]["--primary"]);
      if (primary.l === accentL) continue; // already legible, left alone
      if (primary.l === 0 || primary.l === 100) continue; // pinned to the end

      // One point back towards the page must fail, or the fit overshot.
      const back = primary.l + (theme === "light" ? 1 : -1);
      const backHex = channelsToHex(`${primary.h} ${primary.s}% ${back}%`);
      expect(contrastWithPage(backHex, theme)).toBeLessThan(MIN_CONTRAST);
    }
  });

  it("rescues pale yellow on the light page rather than dropping it", () => {
    const { accent, variables, charts } = deriveTenantPalette("#fff9b0");
    expect(accent).toBe("#fff9b0"); // the tenant's colour is kept, not rejected

    const light = parseChannels(variables.light["--primary"]);
    expect(light.h).toBe(Math.round(toHsl("#fff9b0").h)); // same hue
    expect(light.l).toBeLessThan(40); // ...pushed far down to be readable
    expect(contrastWithPage(charts.light.optimal, "light")).toBeGreaterThanOrEqual(
      MIN_CONTRAST
    );

    // Dark needs no help: the accent is already bright against a near-black page.
    expect(parseChannels(variables.dark["--primary"]).l).toBe(
      Math.round(toHsl("#fff9b0").l)
    );
  });

  it("brightens near-black and darkens near-white where each page needs it", () => {
    const black = deriveTenantPalette("#050505").variables;
    expect(parseChannels(black.light["--primary"]).l).toBeLessThan(10); // already legible
    expect(parseChannels(black.dark["--primary"]).l).toBeGreaterThan(40);

    const white = deriveTenantPalette("#fefefe").variables;
    expect(parseChannels(white.light["--primary"]).l).toBeLessThan(50);
    expect(parseChannels(white.dark["--primary"]).l).toBeGreaterThan(90); // already legible
  });

  it.each(ACCENTS)("keeps the optimal series legible for %s", (_label, hex) => {
    const { charts } = deriveTenantPalette(hex);
    for (const theme of THEMES) {
      expect(contrastWithPage(charts[theme].optimal, theme)).toBeGreaterThanOrEqual(
        MIN_CONTRAST
      );
    }
  });
});

describe("rule 2 — semantic colours survive the tenant (D10)", () => {
  it.each(ACCENTS)("leaves danger, gain amber and the chrome alone for %s", (_label, hex) => {
    const house = deriveTenantPalette(DEFAULT_ACCENT_HEX).charts;
    const tenant = deriveTenantPalette(hex).charts;
    for (const theme of THEMES) {
      expect(tenant[theme].danger).toBe(house[theme].danger);
      expect(tenant[theme].user).toBe(house[theme].user);
      expect(tenant[theme].userBar).toEqual(house[theme].userBar);
      expect(tenant[theme].asset).toBe(house[theme].asset);
      expect(tenant[theme].markerOutline).toBe(house[theme].markerOutline);
      expect(tenant[theme].cursor).toBe(house[theme].cursor);
    }
  });

  it("pushes a pure-red accent out of the loss hue for chart series", () => {
    const { charts, variables, pdf } = deriveTenantPalette("#ff0000");

    for (const theme of THEMES) {
      const hue = toHsl(charts[theme].optimal).h;
      expect(hueGap(hue, 0)).toBeGreaterThanOrEqual(20 - HUE_ROUNDING);
      // Nudged towards orange, not magenta: gold's side of the wheel.
      expect(hue).toBeGreaterThan(0);
      expect(hue).toBeLessThan(60);
      // And far enough from `danger` to be a different line on the chart.
      expect(hueGap(hue, toHsl(charts[theme].danger).h)).toBeGreaterThanOrEqual(
        20 - HUE_ROUNDING
      );
    }

    // The dodge is chart-only: the app chrome and the report keep the real brand.
    expect(parseChannels(variables.light["--primary"]).h).toBe(0);
    expect(parseChannels(variables.dark["--primary"]).h).toBe(0);
    expect(pdf.gold).toBe("#ff0000");
  });

  it("pushes a crimson accent out the near side of the loss hue", () => {
    const { charts } = deriveTenantPalette("#dc143c"); // hue 348
    for (const theme of THEMES) {
      const hue = toHsl(charts[theme].optimal).h;
      expect(hueGap(hue, 0)).toBeGreaterThanOrEqual(20 - HUE_ROUNDING);
      expect(hue).toBeLessThan(360);
      expect(hue).toBeGreaterThan(180); // rotated to magenta, the nearer edge
    }
  });

  it("pushes an emerald accent out of the gain hue", () => {
    const { charts, variables } = deriveTenantPalette("#10b981"); // hue 160
    for (const theme of THEMES) {
      expect(hueGap(toHsl(charts[theme].optimal).h, 155)).toBeGreaterThanOrEqual(
        22 - HUE_ROUNDING
      );
    }
    // Again, chrome keeps the tenant's green.
    expect(parseChannels(variables.dark["--primary"]).h).toBe(160);
  });

  it("leaves an accent that is already clear of both bands alone", () => {
    const { charts } = deriveTenantPalette("#1f6feb"); // hue 216
    for (const theme of THEMES) {
      expect(Math.round(toHsl(charts[theme].optimal).h)).toBe(216);
    }
  });
});

describe("rule 3 — chart values stay real hex", () => {
  it.each(ACCENTS)("emits six-digit lowercase hex everywhere for %s", (_label, hex) => {
    const { charts, pdf } = deriveTenantPalette(hex);
    for (const theme of THEMES) {
      for (const value of chartHexes(charts[theme])) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    for (const value of Object.values(pdf)) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("survives the alpha-by-concatenation the call sites use", () => {
    const { charts } = deriveTenantPalette("#1f6feb");
    // `${color}55` in chart-theme.tsx, `${colors.danger}1f` in DrawdownChart.
    expect(`${charts.dark.optimal}55`).toMatch(/^#[0-9a-f]{8}$/);
    expect(`${charts.dark.danger}1f`).toMatch(/^#[0-9a-f]{8}$/);
  });
});

describe("chart series", () => {
  it.each(ACCENTS)("only rebrands the first palette slot for %s", (_label, hex) => {
    const house = deriveTenantPalette(DEFAULT_ACCENT_HEX).charts;
    const tenant = deriveTenantPalette(hex).charts;
    for (const theme of THEMES) {
      expect(tenant[theme].palette.slice(1)).toEqual(
        house[theme].palette.slice(1)
      );
      expect(tenant[theme].palette.map((entry) => entry.name)).toEqual(
        house[theme].palette.map((entry) => entry.name)
      );
      // The frontier keeps its own identity too — it is not a brand surface.
      expect(tenant[theme].frontier).toBe(house[theme].frontier);
      expect(tenant[theme].frontierFrom).toBe(house[theme].frontierFrom);
      expect(tenant[theme].frontierTo).toBe(house[theme].frontierTo);
    }
  });

  it.each(ACCENTS)("keeps the bar gradient the right way round for %s", (_label, hex) => {
    const { charts } = deriveTenantPalette(hex);
    for (const theme of THEMES) {
      const brand = charts[theme].palette[0];
      expect(charts[theme].optimal).toBe(brand.stroke);
      expect(charts[theme].optimalBar).toEqual([brand.solid, brand.soft]);
      expect(toHsl(brand.solid).l).toBeLessThanOrEqual(toHsl(brand.stroke).l);
      expect(toHsl(brand.soft).l).toBeGreaterThanOrEqual(toHsl(brand.stroke).l);
    }
  });

  it("hands out the shipped benchmark order when nothing clashes", () => {
    const house = deriveTenantPalette(DEFAULT_ACCENT_HEX).charts;
    expect(house.dark.benchmarks).toEqual([
      "#60a5fa",
      "#2dd4bf",
      "#fb7185",
      "#a3e635",
      "#f0abfc",
      "#38bdf8",
    ]);
  });

  it("sends benchmarks that look like the accent to the back of the queue", () => {
    const house = deriveTenantPalette(DEFAULT_ACCENT_HEX).charts.dark.benchmarks;
    const blue = deriveTenantPalette("#1f6feb").charts.dark.benchmarks;

    // Same six colours — reordered, never recoloured, so no two can collide.
    expect([...blue].sort()).toEqual([...house].sort());
    expect(blue).not.toEqual(house);

    const accentHue = toHsl("#1f6feb").h;
    expect(hueGap(toHsl(blue[0]).h, accentHue)).toBeGreaterThanOrEqual(
      24 - HUE_ROUNDING
    );
    // The blues that were bumped are still there, just picked last.
    expect(blue.slice(-2)).toEqual(expect.arrayContaining(["#60a5fa", "#38bdf8"]));
  });

  it("keeps every achromatic accent from silently tinting the palette", () => {
    // Grey has no hue: adding saturation to it would invent one.
    const grey = deriveTenantPalette("#808080").charts.dark.palette[0];
    for (const value of [grey.stroke, grey.solid, grey.soft]) {
      expect(toHsl(value).s).toBeLessThan(1);
    }
  });
});

describe("PDF colours", () => {
  it("keeps the report chrome that simulation-pdf.ts ships", () => {
    const { pdf } = deriveTenantPalette("#1f6feb");
    expect(pdf.background).toBe("#0b0c0f");
    expect(pdf.surface).toBe("#14161c");
    expect(pdf.border).toBe("#2a2d38");
    expect(pdf.text).toBe("#e7e6e4");
    expect(pdf.muted).toBe("#8b8fa0");
    expect(pdf.user).toBe("#fbbf24");
  });

  it("hands the house accent back the gold the report already uses", () => {
    // COLOR_GOLD in simulation-pdf.ts is #d6a042; the seeded accent is #d7a042.
    expect(deriveTenantPalette(DEFAULT_ACCENT_HEX).pdf.gold).toBe("#d7a042");
  });

  it.each(ACCENTS)("keeps the report gold readable on its dark page for %s", (_label, hex) => {
    const { pdf } = deriveTenantPalette(hex);
    expect(contrastRatio(pdf.gold, pdf.background)).toBeGreaterThanOrEqual(
      MIN_CONTRAST
    );
    expect(toHsl(pdf.goldSoft).l).toBeGreaterThanOrEqual(toHsl(pdf.gold).l);
  });
});
