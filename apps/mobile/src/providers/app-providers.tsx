import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { queryClient } from '@/lib/query-client';
import { LocaleProvider } from '@/providers/locale-provider';

/**
 * Navigation theme pinned to the brand (the web app is dark-only). Extends
 * React Navigation's DarkTheme so default surfaces (screen backgrounds, cards)
 * use the brand navy and gold instead of the stock near-black/blue.
 */
const BrandNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.tint,
    background: Colors.dark.background,
    card: Colors.dark.background,
    text: Colors.dark.text,
    border: Colors.dark.border,
    notification: Colors.dark.negative,
  },
};

/**
 * App-wide providers, kept out of the root layout so screens stay focused on
 * navigation. Order matters: gesture handling and safe-area context wrap the
 * data and theme providers.
 *
 * `children` is typed from `ThemeProvider` rather than `React.ReactNode`
 * directly: in this monorepo the web app pins `@types/react` v18 while this app
 * uses v19, and deriving the type here keeps the two `ReactNode` identities
 * aligned at the only boundary where they meet.
 */
type AppProvidersProps = {
  children: React.ComponentProps<typeof ThemeProvider>['children'];
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LocaleProvider>
            <ThemeProvider value={BrandNavigationTheme}>{children}</ThemeProvider>
          </LocaleProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
