import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';

import { LocaleSwitcher } from '@/components/locale-switcher';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';

function renderLocaleSwitcher() {
  return <LocaleSwitcher />;
}

export default function TabsLayout() {
  const theme = useTheme();
  const t = useTranslations();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerRight: renderLocaleSwitcher,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="optimizer"
        options={{
          title: t('tabs.optimizer'),
          tabBarIcon: ({ color, size }) => <Ionicons name="trending-up" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
