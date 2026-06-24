import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { queryClient } from '@/lib/query-client';
import { LocaleProvider } from '@/providers/locale-provider';

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
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <LocaleProvider>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              {children}
            </ThemeProvider>
          </LocaleProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
