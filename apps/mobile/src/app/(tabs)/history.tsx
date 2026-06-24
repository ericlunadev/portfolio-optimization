import { router } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthPanel } from '@/components/auth/auth-panel';
import { SimulationCard } from '@/components/history/simulation-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import {
  useDeleteSimulation,
  useRerunSimulation,
  useSimulations,
  useTogglePinnedSimulation,
} from '@/hooks/use-simulations';
import type { SimulationListItem } from '@/lib/api/simulations';
import { useSession } from '@/lib/auth-client';

export default function HistoryScreen() {
  const theme = useTheme();
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['bottom']} style={styles.centered}>
          <ActivityIndicator color={theme.tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!session) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['bottom']} style={styles.flex}>
          <AuthPanel />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return <SignedInHistory />;
}

function SignedInHistory() {
  const t = useTranslations();
  const theme = useTheme();

  const simulations = useSimulations();
  const togglePin = useTogglePinnedSimulation();
  const rerun = useRerunSimulation();
  const remove = useDeleteSimulation();

  const items = simulations.data ?? [];

  const openDetail = (id: string) => router.push({ pathname: '/simulation/[id]', params: { id } });

  const confirmDelete = (item: SimulationListItem) => {
    Alert.alert(t('history.deleteConfirmTitle'), t('history.deleteConfirmBody'), [
      { text: t('history.cancel'), style: 'cancel' },
      {
        text: t('history.delete'),
        style: 'destructive',
        onPress: () => remove.mutate(item.id),
      },
    ]);
  };

  const handleRerun = (item: SimulationListItem) => {
    rerun.mutate(
      { id: item.id, params: item.params },
      {
        onError: () => Alert.alert(t('history.rerunErrorTitle'), t('history.rerunErrorBody')),
      },
    );
  };

  const renderItem = ({ item }: { item: SimulationListItem }) => (
    <SimulationCard
      item={item}
      onPress={() => openDetail(item.id)}
      onTogglePin={() => togglePin.mutate({ id: item.id, pinned: !item.pinned })}
      onRerun={() => handleRerun(item)}
      onDelete={() => confirmDelete(item)}
      isRerunning={rerun.isPending && rerun.variables?.id === item.id}
    />
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['bottom']} style={styles.flex}>
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={Separator}
          refreshing={simulations.isRefetching}
          onRefresh={() => simulations.refetch()}
          ListHeaderComponent={
            <View style={styles.heading}>
              <ThemedText type="title" style={styles.title}>
                {t('history.pageTitle')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('history.pageSubtitle')}
              </ThemedText>
            </View>
          }
          ListEmptyComponent={
            simulations.isLoading ? (
              <ActivityIndicator color={theme.tint} style={styles.loader} />
            ) : simulations.isError ? (
              <ThemedText type="small" themeColor="negative">
                {t('history.loadError')}
              </ThemedText>
            ) : (
              <View style={styles.empty}>
                <ThemedText type="smallBold">{t('history.emptyTitle')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('history.emptyHint')}
                </ThemedText>
              </View>
            )
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    padding: Spacing.four,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.four,
    flexGrow: 1,
  },
  heading: {
    gap: Spacing.one,
    marginBottom: Spacing.one,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  separator: {
    height: Spacing.three,
  },
  loader: {
    marginTop: Spacing.four,
  },
  empty: {
    gap: Spacing.one,
    marginTop: Spacing.four,
  },
});
