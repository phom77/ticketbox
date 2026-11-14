import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { syncSummaryText, useScannerLanguage, type MessageKey } from '../i18n';
import { filterHistory, type HistoryEntry, type HistoryFilter } from '../features/checkin/history';
import type { PendingSyncSummary } from '../features/sync';
import { EmptyState, ErrorBanner, SecondaryButton } from '../ui/components';
import { ScanHistoryRow } from '../ui/ScanHistoryRow';
import { colors, radius, spacing } from '../ui/theme';

const filters: ReadonlyArray<readonly [HistoryFilter, MessageKey]> = [
  ['all', 'all'], ['confirmed', 'confirmed'], ['pending', 'pendingFilter'], ['error', 'error'],
];

type Props = {
  eventTitle: string;
  entries: HistoryEntry[];
  serverTotal: number | null;
  isLoading: boolean;
  errorMessage: string | null;
  pending: number;
  syncing: boolean;
  syncError: string | null;
  syncSummary: PendingSyncSummary | null;
  onReload: () => void;
  onSync: () => void;
};

export function ScanHistoryScreen(props: Props) {
  const { t, number } = useScannerLanguage();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [query, setQuery] = useState('');
  const rows = filterHistory(props.entries, filter, query);
  const filtered = filter !== 'all' || Boolean(query.trim());
  const confirmed = props.entries.filter((entry) => entry.status === 'confirmed').length;
  const failures = props.entries.filter((entry) => entry.status === 'conflict' || entry.status === 'failed').length;
  const loadedServer = props.entries.filter((entry) => entry.source === 'server').length;
  const scope = props.serverTotal !== null
    ? t('historyScope', { loaded: number(loadedServer), total: number(props.serverTotal) })
    : t('onDevice');

  return (
    <View style={styles.screen}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ScanHistoryRow item={item} />}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshing={props.isLoading}
        onRefresh={props.onReload}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.event}>{props.eventTitle}</Text>
            <Text style={styles.muted}>{scope}</Text>
            <View style={styles.totals}>
              <Metric value={props.entries.length} label={t('loaded')} />
              <Metric value={confirmed} label={t('confirmedMetric')} />
              <Metric value={failures} label={t('error')} />
            </View>
            <View style={styles.search}>
              <MaterialIcons name="search" size={20} color={colors.textMuted} />
              <TextInput
                accessibilityLabel={t('historySearch')}
                placeholder={t('searchCodes')}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                value={query}
                onChangeText={setQuery}
                style={styles.input}
              />
            </View>
            <View style={styles.filters}>
              {filters.map(([key, label]) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: key === filter }}
                  onPress={() => setFilter(key)}
                  style={[styles.filter, key === filter && styles.filterSelected]}
                >
                  <Text style={styles.filterLabel}>{t(label)}</Text>
                </Pressable>
              ))}
            </View>
            {props.errorMessage ? (
              <>
                <ErrorBanner message={props.errorMessage} />
                <SecondaryButton label={t('reloadHistory')} disabled={props.isLoading} onPress={props.onReload} />
              </>
            ) : null}
            {props.isLoading ? (
              <View accessibilityLiveRegion="polite" style={styles.loading}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.muted}>{t('loadingHistory')}</Text>
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={!props.isLoading ? (
          <EmptyState
            title={filtered ? t('noMatchingScans') : props.errorMessage ? t('historyUnavailable') : t('noScanHistory')}
            message={filtered ? t('tryFilters') : props.errorMessage
              ? t('tryConnection') : t('historyEmpty')}
          />
        ) : null}
      />
      <View style={styles.sync}>
        <View style={styles.syncCopy} accessibilityLiveRegion="polite" aria-live="polite">
          <Text style={styles.filterLabel}>{t('pendingCount', { count: number(props.pending) })}</Text>
          {props.syncError ? <Text style={styles.error}>{props.syncError}</Text> : null}
          {!props.syncError && props.syncSummary ? (
            <Text style={styles.muted}>
              {syncSummaryText(t, number, props.syncSummary)}
            </Text>
          ) : null}
        </View>
        <SecondaryButton label={props.syncing ? t('syncing') : t('syncNow')}
          disabled={props.syncing || props.pending === 0} onPress={props.onSync} />
      </View>
    </View>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  const { number } = useScannerLanguage();
  return (
    <View style={styles.metric}>
      <Text style={styles.event}>{number(value)}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: spacing.screen },
  header: { gap: 12, marginBottom: 12 },
  event: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  totals: {
    flexDirection: 'row', borderRadius: radius.card, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surfaceMuted,
  },
  metric: { flex: 1, gap: 4, padding: 10 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    borderWidth: 1, borderRadius: radius.input, borderColor: colors.border,
  },
  input: { flex: 1, minHeight: 48, color: colors.text, fontSize: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: {
    flexGrow: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.button,
    borderWidth: 1, borderColor: colors.border,
  },
  filterSelected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  filterLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sync: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 12,
    borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.surfaceMuted,
  },
  syncCopy: { flex: 1, minWidth: 120, gap: 4 },
});
