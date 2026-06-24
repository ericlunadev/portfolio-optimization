/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Brand palette, ported from the web app (`apps/web/src/styles/globals.css`):
 * a dark navy canvas, warm off-white text, and a gold primary accent. The web
 * app is dark-only, so the mobile app matches it — both schemes resolve to the
 * same brand colors and `useTheme` pins to dark (see `use-theme.ts`).
 */
const Brand = {
  /** Warm off-white — web `--foreground`. */
  text: '#E7E6E4',
  /** Near-black navy canvas — web `--background`. */
  background: '#0B0B0F',
  /** Card / elevated surface — web `--card`. */
  backgroundElement: '#111217',
  /** Selected / hover surface — web `--accent`. */
  backgroundSelected: '#23252F',
  /** Muted copy — web `--muted-foreground`. */
  textSecondary: '#75798A',
  /** Gold primary accent — web `--primary`. */
  tint: '#D7A042',
  /** Hairlines & dividers — web `--border`. */
  border: '#262831',
  /** Positive returns (gains). */
  positive: '#4ADE80',
  /** Negative returns (losses) — web `--destructive`. */
  negative: '#E25050',
} as const;

export const Colors = {
  light: Brand,
  dark: Brand,
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * Brand typefaces, matching the web app: Instrument Serif for display/headings
 * and Manrope for body copy. The family strings are the export names from the
 * `@expo-google-fonts/*` packages; the matching weights are loaded in the root
 * layout via `useFonts`. With custom fonts, weight must be selected by family
 * (not `fontWeight`), so each weight is its own family.
 */
export const FontFamily = {
  /** Instrument Serif (400) — display headings. */
  serif: 'InstrumentSerif_400Regular',
  /** Manrope 500 — default body. */
  body: 'Manrope_500Medium',
  /** Manrope 600 — emphasized body. */
  bodySemibold: 'Manrope_600SemiBold',
  /** Manrope 700 — bold body. */
  bodyBold: 'Manrope_700Bold',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
