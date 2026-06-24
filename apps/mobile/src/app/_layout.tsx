import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { AppProviders } from '@/providers/app-providers';

// Ensure i18n is initialized before any screen renders.
import '@/i18n';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Keep the native splash up until the brand fonts are ready to avoid a flash of
// the system font.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <AppProviders>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.dark.background },
          headerTintColor: Colors.dark.text,
          contentStyle: { backgroundColor: Colors.dark.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="simulation/[id]" options={{ title: '' }} />
        <Stack.Screen name="+not-found" options={{ title: '' }} />
      </Stack>
      <StatusBar style="light" />
    </AppProviders>
  );
}
