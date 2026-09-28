import type { ChartColors } from "@/components/charts/chart-theme";
import type { ResolvedTheme } from "@/lib/theme";

/**
 * The single source of tenant colour.
 *
 * A tenant supplies exactly one accent hex (decision D9). Every gold surface in
 * the product — the CSS tokens in `globals.css`, the chart series in
 * `chart-theme.tsx`, the PDF constants in `simulation-pdf.ts` — is derived from
 * it here, so there is one place that knows how a brand colour becomes a theme
 * instead of three palettes drifting apart.
 *
 * Three rules constrain the derivation:
 *
 * 1. **Contrast.** The accent is *fitted* to 4.5:1 against `--background` in
 *    each appearance rather than rejected, moving away from the page in each
 *    theme — darker on light, brighter on dark — exactly as `--primary-emphasis`
 *    already does. The fit is minimal: it stops at the first lightness that
 *    passes, so the result stays as close to the tenant's colour as the ratio
 *    allows.
 * 2. **Semantics (D10).** Gain stays green and loss stays red. An accent that
 *    lands on one of those hues is rotated out of it **for chart series only**;
 *    otherwise a red-branded tenant gets a chart where "your portfolio" reads as
 *    "you lost money". The CSS tokens and the PDF keep the tenant's true colour.
 * 3. **Hex out.** Chart call sites build translucent variants by concatenating a
 *    hex alpha pair (`${color}55`, `${colors.danger}1f`), so every chart value
 *    stays a real six-digit hex string — never a CSS variable.
 *
 * What it deliberately does not do: repaint the non-brand series to dodge the
 * accent. A violet tenant gets a violet frontier and a blue one gets a blue
 * benchmark further down the list — near-misses, where recolouring a fixed
 * palette to escape one hue reliably pushes two other series onto each other.
 *
 * Pure: same input, same output, no DOM, no I/O, no caching (Task 1.8 owns that).
 */

/** The house gold, and the accent every tenant row is seeded with. */
export const DEFAULT_ACCENT_HEX = "#d7a042";

/** WCAG AA for body text. What a derived `--primary` must clear. */
export const MIN_CONTRAST = 4.5;

/** WCAG AA for large text. The floor for display gradients and the focus ring. */
export const MIN_LARGE_TEXT_CONTRAST = 3;

/**
 * `--background` in each appearance, mirroring `globals.css`. The contrast fit
 * is measured against these, so they have to be updated together.
 */
const BACKGROUND: Record<ResolvedTheme, Hsl> = {
  light: { h: 40, s: 30, l: 97 },
  dark: { h: 230, s: 15, l: 5 },
};

/** The page colour each theme is fitted against, as hex. */
export const THEME_BACKGROUND_HEX: Record<ResolvedTheme, string> = {
  light: hslToHex(BACKGROUND.light),
  dark: hslToHex(BACKGROUND.dark),
};

/**
 * Hue bands the accent may not occupy *as a chart series*, because the app
 * already spends them on meaning: loss/`danger` red and gain emerald. An accent
 * inside a band is rotated to its nearest edge.
 */
const SEMANTIC_HUE_ZONES = [
  { center: 0, halfWidth: 20 }, // loss, and `ChartColors.danger`
  { center: 155, halfWidth: 22 }, // gain (emerald sits at ~160)
];

/**
 * How close a benchmark hue may sit to the accent before it is handed out last.
 * Without it a blue-branded tenant's first benchmark is the same blue as the
 * line labelled "your optimised portfolio".
 */
const MIN_SERIES_HUE_GAP = 24;

/** Below this saturation a colour has no hue identity worth protecting. */
const ACHROMATIC_SATURATION = 8;

/** Ceiling for the pale end of a bar gradient, so it never washes out to paper. */
const SOFT_MAX_LIGHTNESS = 92;

export type TenantCssVariable =
  | "--primary"
  | "--primary-emphasis"
  | "--ring"
  | "--gradient-gold-from"
  | "--gradient-gold-to"
  | "--glow-strong"
  | "--glow-soft";

/**
 * Accent tokens for one appearance, keyed by the custom property they override.
 * Values are bare HSL channels (`38 62% 36%`), the shape `globals.css` stores
 * and `hsl(var(--token))` expects; the glows carry their own alpha.
 */
export type TenantCssVariables = Record<TenantCssVariable, string>;

/**
 * The PDF palette. Mirrors the dark appearance because the report is painted on
 * a dark page and the charts are rasterized for one. Only the gold pair is
 * tenant-derived — the chrome and the user-allocation amber are fixed.
 */
export interface TenantPdfColors {
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  gold: string;
  goldSoft: string;
  user: string;
}

export interface TenantPalette {
  /** The accent actually used, normalised to `#rrggbb`. */
  accent: string;
  /** True when the input was missing or unparseable and the house gold is in use. */
  isFallback: boolean;
  variables: Record<ResolvedTheme, TenantCssVariables>;
  charts: Record<ResolvedTheme, ChartColors>;
  pdf: TenantPdfColors;
}

/**
 * Accepts `#abc`, `#aabbcc` and the same without the hash, in any case; returns
 * the canonical `#aabbcc`. Eight-digit (alpha) input is rejected rather than
 * silently truncated — a brand accent with an alpha channel is a mistake worth
 * surfacing in the branding form.
 */
export function normalizeAccentHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

export function isValidAccentHex(value: unknown): boolean {
  return normalizeAccentHex(value) !== null;
}

/** WCAG 2.1 contrast ratio between two opaque hex colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function deriveTenantPalette(accentHex?: string | null): TenantPalette {
  const normalized = normalizeAccentHex(accentHex);
  const accent = normalized ?? DEFAULT_ACCENT_HEX;
  // Quantise once, at the door. `--primary` ships as whole HSL channels, so a
  // colour that only clears 4.5:1 *before* rounding would ship failing it;
  // fitting the rounded value means the number measured here is the number the
  // browser paints. Every delta below is a whole step, so it stays that way.
  const accentHsl = roundHsl(hexToHsl(accent));

  // The chart accent is the only one that dodges the semantic bands: the CSS
  // tokens and the PDF gold below deliberately keep the tenant's real hue.
  const seriesHsl = { ...accentHsl, h: avoidSemanticHues(accentHsl.h) };

  return {
    accent,
    isFallback: normalized === null,
    variables: {
      light: deriveVariables(accentHsl, "light"),
      dark: deriveVariables(accentHsl, "dark"),
    },
    charts: {
      light: deriveChartColors(seriesHsl, "light"),
      dark: deriveChartColors(seriesHsl, "dark"),
    },
    pdf: derivePdfColors(accentHsl),
  };
}

/* -------------------------------------------------------------------------- */
/* CSS tokens                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Deltas taken from the shipped gold in `globals.css`, so feeding the house
 * accent back in reproduces the design that exists today. `emphasis` steps
 * further from the page, the gradient pair opens up the brand gradient, and the
 * glows are the ring at the alpha each theme uses.
 */
const TOKEN_DELTAS: Record<
  ResolvedTheme,
  {
    emphasis: HslDelta;
    ring: HslDelta;
    gradientFrom: HslDelta;
    gradientTo: HslDelta;
    glowStrong: number;
    glowSoft: number;
  }
> = {
  light: {
    emphasis: { s: 10, l: -9 },
    ring: { s: 0, l: 4 },
    gradientFrom: { s: 3, l: -2 },
    gradientTo: { s: 18, l: 10 },
    glowStrong: 0.22,
    glowSoft: 0.08,
  },
  dark: {
    emphasis: { s: 0, l: 10 },
    ring: { s: 0, l: 0 },
    gradientFrom: { s: -5, l: -5 },
    gradientTo: { s: 20, l: 10 },
    glowStrong: 0.15,
    glowSoft: 0.05,
  },
};

function deriveVariables(
  accent: Hsl,
  theme: ResolvedTheme
): TenantCssVariables {
  const deltas = TOKEN_DELTAS[theme];
  const primary = fitContrast(accent, theme, MIN_CONTRAST);

  // Emphasis moves further away from the page, so it can only gain contrast.
  const emphasis = shift(primary, deltas.emphasis);
  // These three move *toward* the page in at least one theme, and the gradient
  // pair paints display headings — large text, so the 3:1 floor is the right one.
  const ring = fitContrast(
    shift(primary, deltas.ring),
    theme,
    MIN_LARGE_TEXT_CONTRAST
  );
  const gradientFrom = fitContrast(
    shift(primary, deltas.gradientFrom),
    theme,
    MIN_LARGE_TEXT_CONTRAST
  );
  const gradientTo = fitContrast(
    shift(primary, deltas.gradientTo),
    theme,
    MIN_LARGE_TEXT_CONTRAST
  );

  return {
    "--primary": toChannels(primary),
    "--primary-emphasis": toChannels(emphasis),
    "--ring": toChannels(ring),
    "--gradient-gold-from": toChannels(gradientFrom),
    "--gradient-gold-to": toChannels(gradientTo),
    "--glow-strong": `${toChannels(ring)} / ${deltas.glowStrong}`,
    "--glow-soft": `${toChannels(ring)} / ${deltas.glowSoft}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Chart series                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The house series sets, copied from `chart-theme.tsx` because that module does
 * not export them. Everything a tenant does not own is passed through untouched.
 * These are duplicated, not forked: when `chart-theme.tsx` starts taking a
 * tenant palette it should import them from here and delete its own copies.
 */
const BASE_CHART_COLORS: Record<ResolvedTheme, ChartColors> = {
  dark: {
    palette: [
      { name: "gold", stroke: "#e0a861", solid: "#c89853", soft: "#fcd9a8" },
      { name: "emerald", stroke: "#34d399", solid: "#10b981", soft: "#a7f3d0" },
      { name: "violet", stroke: "#a78bfa", solid: "#8b5cf6", soft: "#c4b5fd" },
      { name: "amber", stroke: "#fbbf24", solid: "#f59e0b", soft: "#fde68a" },
      { name: "blue", stroke: "#60a5fa", solid: "#3b82f6", soft: "#bfdbfe" },
      { name: "teal", stroke: "#2dd4bf", solid: "#14b8a6", soft: "#99f6e4" },
      { name: "rose", stroke: "#fb7185", solid: "#f43f5e", soft: "#fda4af" },
      { name: "lime", stroke: "#a3e635", solid: "#84cc16", soft: "#d9f99d" },
    ],
    optimal: "#e0a861",
    user: "#fbbf24",
    frontier: "#a78bfa",
    asset: "#94a3b8",
    benchmarks: [
      "#60a5fa",
      "#2dd4bf",
      "#fb7185",
      "#a3e635",
      "#f0abfc",
      "#38bdf8",
    ],
    danger: "#f87171",
    frontierFrom: "#7c3aed",
    frontierTo: "#22d3ee",
    optimalBar: ["#c89853", "#fcd9a8"],
    userBar: ["#f59e0b", "#fde68a"],
    markerOutline: "#0d0e13",
    cursor: "#3f4457",
  },
  light: {
    palette: [
      { name: "gold", stroke: "#a97b2f", solid: "#8a6224", soft: "#d9b57a" },
      { name: "emerald", stroke: "#059669", solid: "#047857", soft: "#6ee7b7" },
      { name: "violet", stroke: "#7c3aed", solid: "#6d28d9", soft: "#a78bfa" },
      { name: "amber", stroke: "#d97706", solid: "#b45309", soft: "#fcd34d" },
      { name: "blue", stroke: "#2563eb", solid: "#1d4ed8", soft: "#93c5fd" },
      { name: "teal", stroke: "#0d9488", solid: "#0f766e", soft: "#5eead4" },
      { name: "rose", stroke: "#e11d48", solid: "#be123c", soft: "#fda4af" },
      { name: "lime", stroke: "#65a30d", solid: "#4d7c0f", soft: "#bef264" },
    ],
    optimal: "#8a6224",
    user: "#b45309",
    frontier: "#6d28d9",
    asset: "#475569",
    benchmarks: [
      "#2563eb",
      "#0d9488",
      "#e11d48",
      "#65a30d",
      "#c026d3",
      "#0284c7",
    ],
    danger: "#dc2626",
    frontierFrom: "#6d28d9",
    frontierTo: "#0e7490",
    optimalBar: ["#8a6224", "#c99a49"],
    userBar: ["#b45309", "#e8a33d"],
    markerOutline: "#ffffff",
    cursor: "#a8a294",
  },
};

/**
 * How the shipped gold entry spaces its stroke, solid and soft, read back off
 * `chart-theme.tsx`. Light pulls saturation down as it lightens (a pale tan);
 * dark pushes it up (a lit gold), which is why the two are not one delta.
 */
const TRIO_DELTAS: Record<ResolvedTheme, { solid: HslDelta; soft: HslDelta }> = {
  light: { solid: { s: 2, l: -9 }, soft: { s: -2, l: 24 } },
  dark: { solid: { s: -15, l: -8 }, soft: { s: 26, l: 19 } },
};

/**
 * Stroke, solid and soft for one accent. `soft` never lands below the stroke: an
 * accent already near white has nowhere lighter to go, and an inverted pair
 * would draw every bar gradient backwards.
 */
function accentTrio(accent: Hsl, theme: ResolvedTheme) {
  const deltas = TRIO_DELTAS[theme];
  const soft = shift(accent, deltas.soft, SOFT_MAX_LIGHTNESS);
  return {
    stroke: hslToHex(accent),
    solid: hslToHex(shift(accent, deltas.solid)),
    soft: hslToHex({ ...soft, l: Math.max(soft.l, accent.l) }),
  };
}

function deriveChartColors(
  seriesAccent: Hsl,
  theme: ResolvedTheme
): ChartColors {
  const base = BASE_CHART_COLORS[theme];
  const accent = fitContrast(seriesAccent, theme, MIN_CONTRAST);
  const trio = accentTrio(accent, theme);

  return {
    ...base,
    // Only the first entry — the brand slot — is the tenant's. Every other
    // series keeps its shipped hex: recolouring them to dodge the accent sounds
    // tidy but pushes neighbours onto each other (an emerald accent lands teal
    // and emerald on the same hue), which is a worse chart than the near-miss.
    palette: base.palette.map((entry, i) =>
      i === 0 ? { ...entry, ...trio } : entry
    ),
    optimal: trio.stroke,
    optimalBar: [trio.solid, trio.soft],
    benchmarks: deprioritizeAccentLookalikes(base.benchmarks, accent),
    // Untouched on purpose: `danger` is semantic (D10); `user`/`userBar` are the
    // amber the design already pairs with gold five degrees away, told apart by
    // lightness rather than hue; `asset`, `markerOutline` and `cursor` are chrome.
  };
}

/**
 * Benchmarks are "handed out in selection order" and already "deliberately skip
 * the gold, amber and violet already spoken for" (`chart-theme.tsx`), so extend
 * that intent to the tenant's accent: a benchmark colour too close to it goes to
 * the back of the queue rather than being recoloured. Reordering a fixed list
 * cannot invent the collision that rotating a hue can.
 */
function deprioritizeAccentLookalikes(
  benchmarks: string[],
  accent: Hsl
): string[] {
  const clashes = (hex: string) => {
    const color = hexToHsl(hex);
    return (
      color.s >= ACHROMATIC_SATURATION &&
      hueDistance(color.h, accent.h) < MIN_SERIES_HUE_GAP
    );
  };
  return [
    ...benchmarks.filter((hex) => !clashes(hex)),
    ...benchmarks.filter(clashes),
  ];
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                         */
/* -------------------------------------------------------------------------- */

function derivePdfColors(accent: Hsl): TenantPdfColors {
  // The report page (#0b0c0f) is within a point of the dark `--background`, so
  // the dark fit is the right one. No semantic dodge: this gold paints headings
  // and rules, not a series.
  const gold = fitContrast(accent, "dark", MIN_CONTRAST);
  const trio = accentTrio(gold, "dark");

  return {
    background: "#0b0c0f",
    surface: "#14161c",
    border: "#2a2d38",
    text: "#e7e6e4",
    muted: "#8b8fa0",
    gold: trio.stroke,
    goldSoft: trio.soft,
    user: "#fbbf24",
  };
}

/* -------------------------------------------------------------------------- */
/* Colour maths                                                                */
/* -------------------------------------------------------------------------- */

interface Hsl {
  h: number;
  s: number;
  l: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface HslDelta {
  s: number;
  l: number;
}

/**
 * Walks lightness away from the page one point at a time until the colour
 * clears `minRatio` against that theme's `--background`. Contrast is monotonic
 * in lightness once the direction is fixed — darker on light, brighter on dark —
 * so the first pass is also the closest to the tenant's colour. A colour that
 * already clears the ratio is returned untouched.
 */
function fitContrast(color: Hsl, theme: ResolvedTheme, minRatio: number): Hsl {
  const step = theme === "light" ? -1 : 1;
  const background = THEME_BACKGROUND_HEX[theme];
  let l = clamp(Math.round(color.l), 0, 100);
  // Only the end we are walking towards can stop us: a near-white accent starts
  // at l=100 and still has the whole light theme to descend.
  const canStep = () => (step < 0 ? l > 0 : l < 100);

  while (
    contrastRatio(hslToHex({ ...color, l }), background) < minRatio &&
    canStep()
  ) {
    l = clamp(l + step, 0, 100);
  }

  return { ...color, l };
}

/** Applies a delta. Re-checking contrast is the caller's call, not this one's. */
function shift(color: Hsl, delta: HslDelta, maxL = 100): Hsl {
  // An achromatic brand (near-black, near-white, grey) has no hue to saturate:
  // adding saturation would tint it with whatever hue the parser guessed.
  const s =
    color.s < ACHROMATIC_SATURATION ? color.s : clamp(color.s + delta.s, 0, 100);
  return { h: color.h, s, l: clamp(color.l + delta.l, 0, maxL) };
}

/** Rotates a hue out of the loss/gain bands, to the nearer edge. */
function avoidSemanticHues(hue: number): number {
  for (const zone of SEMANTIC_HUE_ZONES) {
    const delta = signedHueDelta(hue, zone.center);
    if (Math.abs(delta) >= zone.halfWidth) continue;
    // Dead centre is a tie; step to the warm/positive edge so a pure-red brand
    // lands on orange-red rather than magenta.
    const direction = delta === 0 ? 1 : Math.sign(delta);
    return normalizeHue(zone.center + direction * zone.halfWidth);
  }
  return hue;
}

/** Shortest distance between two hues, ignoring direction, in [0, 180]. */
function hueDistance(a: number, b: number): number {
  return Math.abs(signedHueDelta(a, b));
}

/** Shortest signed distance from `to` to `from`, in (-180, 180]. */
function signedHueDelta(from: number, to: number): number {
  const delta = ((from - to + 540) % 360) - 180;
  return delta === -180 ? 180 : delta;
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundHsl({ h, s, l }: Hsl): Hsl {
  return { h: Math.round(normalizeHue(h)), s: Math.round(s), l: Math.round(l) };
}

/** `38 62% 36%` — the bare-channel form `globals.css` stores. */
function toChannels({ h, s, l }: Hsl): string {
  return `${Math.round(normalizeHue(h))} ${Math.round(s)}% ${Math.round(l)}%`;
}

/** Unparseable input reads as black, which keeps `contrastRatio` total. */
function hexToRgb(hex: string): Rgb {
  const normalized = normalizeAccentHex(hex) ?? "#000000";
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    clamp(Math.round(value), 0, 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l: l * 100 };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;

  return { h: normalizeHue(h * 60), s: s * 100, l: l * 100 };
}

function hslToHex({ h, s, l }: Hsl): string {
  const hue = normalizeHue(h);
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = ln - c / 2;

  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

/** WCAG relative luminance of an opaque hex colour. */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
