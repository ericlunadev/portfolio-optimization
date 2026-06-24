import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthPanel } from '@/components/auth/auth-panel';
import { useSimulationTitle } from '@/components/history/simulation-card';
import { OptimizationResults } from '@/components/optimizer/optimization-results';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  useRerunSimulation,
  useSimulation,
  useUpdateSimulationName,
} from '@/hooks/use-simulations';
import { useTheme } from '@/hooks/use-theme';
import { useTranslations } from '@/hooks/use-translations';
import type { SavedSimulation } from '@/lib/api/simulations';
import { useSession } from '@/lib/auth-client';
import { formatDate } from '@/lib/format';

const MAX_NAME_LENGTH = 200;

export default function SimulationDetailScreen() {
  const theme = useTheme();
  const t = useTranslations();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: session, isPending: sessionPending } = useSession();
  const simulation = useSimulation(session ? (id ?? null) : null);

  const headerOptions = {
    title: t('history.detailTitle'),
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.text,
  };

  if (sessionPending || (session && simulation.isLoading)) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={headerOptions} />
        <SafeAreaView edges={['bottom']} style={styles.centered}>
          <ActivityIndicator color={theme.tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!session) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={headerOptions} />
        <SafeAreaView edges={['bottom']} style={styles.flex}>
          <AuthPanel />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (simulation.isError || !simulation.data) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={headerOptions} />
        <SafeAreaView edges={['bottom']} style={styles.centered}>
          <ThemedText type="smallBold">{t('history.notFound')}</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return <SimulationDetail simulation={simulation.data} headerOptions={headerOptions} />;
}

function SimulationDetail({
  simulation,
  headerOptions,
}: {
  simulation: SavedSimulation;
  headerOptions: Record<string, unknown>;
}) {
  const t = useTranslations();
  const theme = useTheme();

  const title = useSimulationTitle({
    name: simulation.name,
    tickers: simulation.params.tickers ?? [],
    strategy: simulation.params.strategy,
  });

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(simulation.name ?? '');
  const updateName = useUpdateSimulationName();
  const rerun = useRerunSimulation();

  const saveName = () => {
    const trimmed = draftName.trim();
    updateName.mutate(
      { id: simulation.id, name: trimmed || null },
      { onSuccess: () => setEditing(false) },
    );
  };

  const handleRerun = () => {
    rerun.mutate(
      { id: simulation.id, params: simulation.params },
      { onError: () => Alert.alert(t('history.rerunErrorTitle'), t('history.rerunErrorBody')) },
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={headerOptions} />
      <SafeAreaView edges={['bottom']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.heading}>
            {editing ? (
              <View style={styles.editRow}>
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder={t('history.namePlaceholder')}
                  placeholderTextColor={theme.textSecondary}
                  maxLength={MAX_NAME_LENGTH}
                  autoFocus
                  style={[styles.input, { color: theme.text, borderColor: theme.border }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('history.renameSave')}
                  disabled={updateName.isPending}
                  onPress={saveName}
                  hitSlop={Spacing.two}>
                  {updateName.isPending ? (
                    <ActivityIndicator color={theme.tint} size="small" />
                  ) : (
                    <Ionicons name="checkmark" size={22} color={theme.tint} />
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('history.renameCancel')}
                  onPress={() => {
                    setDraftName(simulation.name ?? '');
                    setEditing(false);
                  }}
                  hitSlop={Spacing.two}>
                  <Ionicons name="close" size={22} color={theme.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.titleRow}>
                <ThemedText type="title" style={styles.title} numberOfLines={2}>
                  {title}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('history.rename')}
                  onPress={() => setEditing(true)}
                  hitSlop={Spacing.two}>
                  <Ionicons name="pencil" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(simulation.createdAt)}
            </ThemedText>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={rerun.isPending}
            onPress={handleRerun}
            style={[styles.rerunButton, { borderColor: theme.tint }]}>
            {rerun.isPending ? (
              <ActivityIndicator color={theme.tint} size="small" />
            ) : (
              <Ionicons name="refresh" size={16} color={theme.tint} />
            )}
            <ThemedText type="smallBold" themeColor="tint">
              {rerun.isPending ? t('history.rerunInProgress') : t('history.rerunAction')}
            </ThemedText>
          </Pressable>

          <OptimizationResults result={simulation.result} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
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
    gap: Spacing.four,
  },
  heading: {
    gap: Spacing.one,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
    fontSize: 28,
    lineHeight: 34,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 18,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
  },
  rerunButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
  },
});
