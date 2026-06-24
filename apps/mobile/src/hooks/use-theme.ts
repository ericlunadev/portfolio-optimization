/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';

/**
 * Returns the active theme colors. The brand (ported from the dark-only web
 * app) is dark, so we pin to the dark palette regardless of the device color
 * scheme — both entries are the same brand palette anyway.
 */
export function useTheme() {
  return Colors.dark;
}
