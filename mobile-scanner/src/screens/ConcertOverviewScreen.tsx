import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDateTime, syncSummaryText, useScannerLanguage } from '../i18n';
import type { StaffConcert, StaffConcertOverview } from '../api';
import type { DatasetInfo, LogStatusCounts } from '../database';
import type { PendingSyncSummary } from '../features/sync';
import {
  ErrorBanner,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

type Props = {
  concert: StaffConcert;
  overview: StaffConcertOverview | null;
  datasetInfo: DatasetInfo;
  counters: LogStatusCounts;
  gate: string;
  gateError: string | null;
  isOnline: boolean;
  isDownloading: boolean;
  isSyncing: boolean;
  errorMessage: string | null;
  syncSummary: PendingSyncSummary | null;
  onChangeGate: (gate: string) => void;
  onDownloadDataset: () => void;
  onSync: () => void;
  onDownloadGuestList: () => void;
  onOpenScanner: () => void;
  onOpenGuests: () => void;
  hasGuestList: boolean;
  isDownloadingGuestList: boolean;
};

export function ConcertOverviewScreen(props: Props) {
  const { t, locale, number } = useScannerLanguage();
  const hasDataset = Boolean(props.datasetInfo.downloadedAt);
  const hasUpdate = Boolean(
    props.overview?.datasetUpdatedAt &&
      props.datasetInfo.downloadedAt &&
      new Date(props.overview.datasetUpdatedAt) > new Date(props.datasetInfo.downloadedAt),
  );

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topActions}>
        <Text style={styles.eventName}>{props.concert.title}</Text>
        <StatusBadge label={props.isOnline ? t('connected') : t('disconnected')} tone={props.isOnline ? 'neutral' : 'warning'} />
      </View>

      {props.errorMessage ? <ErrorBanner message={props.errorMessage} /> : null}

      <View style={styles.field}>
        <Text style={styles.label}>{t('gateField')}</Text>
        <TextInput
          accessibilityLabel={t('gateField')}
          autoCapitalize="characters"
          onChangeText={props.onChangeGate}
          placeholder="A, B, VIP..."
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={props.gate}
        />
        {props.gateError ? <ErrorBanner message={props.gateError} /> : null}
      </View>

      <View style={styles.metrics}>
        <Metric label={t('totalTickets')} value={props.overview?.totalTickets ?? props.datasetInfo.totalCount} />
        <Metric label={t('totalCheckins')} value={props.overview?.totalCheckins ?? 0} />
        <Metric label={t('pending')} value={props.counters.PENDING} tone="warning" />
        <Metric label={t('conflictsErrors')} value={props.counters.CONFLICT + props.counters.FAILED} tone="danger" />
      </View>

      <PrimaryButton
        label={t('startScanning')}
        onPress={props.onOpenScanner}
      />

      <View style={styles.datasetPanel}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>{t('ticketData')}</Text>
            <Text style={styles.helper}>
              {hasDataset
                ? t('datasetStamp', { count: number(props.datasetInfo.totalCount), date: formatDateTime(props.datasetInfo.downloadedAt!, locale) })
                : t('ticketDataHint')}
            </Text>
          </View>
          <StatusBadge
            label={hasUpdate ? t('updateAvailable') : hasDataset ? t('ready') : t('notDownloaded')}
            tone={hasUpdate ? 'warning' : hasDataset ? 'success' : 'neutral'}
          />
        </View>
        <PrimaryButton
          disabled={!props.isOnline}
          label={hasDataset ? t('updateTicketData') : t('downloadTicketData')}
          loading={props.isDownloading}
          onPress={props.onDownloadDataset}
        />
      </View>

      <View style={styles.datasetPanel}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>{t('guestList')}</Text>
            <Text style={styles.helper}>
              {props.hasGuestList
                ? t('guestDownloadDone')
                : t('guestDownloadEmpty')}
            </Text>
          </View>
          <StatusBadge
            label={props.hasGuestList ? t('ready') : t('notDownloaded')}
            tone={props.hasGuestList ? 'success' : 'neutral'}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              disabled={!props.isOnline}
              label={t('downloadGuests')}
              loading={props.isDownloadingGuestList}
              onPress={props.onDownloadGuestList}
            />
          </View>
          {props.hasGuestList && (
            <View style={{ flex: 1 }}>
              <SecondaryButton
                label={t('viewGuestList')}
                onPress={props.onOpenGuests}
              />
            </View>
          )}
        </View>
      </View>

      <View style={styles.syncPanel}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{t('syncScans')}</Text>
          <Text style={styles.helper}>
            {props.counters.PENDING
              ? t('pendingCount', { count: number(props.counters.PENDING) })
              : t('noPending')}
          </Text>
        </View>
        <SecondaryButton
          disabled={props.isSyncing || props.counters.PENDING === 0}
          label={props.isSyncing ? t('syncing') : t('syncNow')}
          onPress={props.onSync}
        />
        {props.syncSummary ? (
          <Text style={styles.helper}>
            {syncSummaryText(t, number, props.syncSummary)}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'warning' | 'danger';
}) {
  const { number } = useScannerLanguage();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, tone === 'warning' && styles.warning, tone === 'danger' && styles.danger]}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.section },
  eventName: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '700' },
  topActions: { gap: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  datasetPanel: {
    gap: 16,
    padding: spacing.card,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  sectionCopy: { flex: 1, gap: 5 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  helper: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  field: { gap: 7 },
  label: { color: colors.text, fontSize: 13, fontWeight: '800' },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    width: '48%',
    paddingVertical: 14,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  metricValue: { color: colors.text, fontSize: 26, fontWeight: '900' },
  metricLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  warning: { color: colors.warning },
  danger: { color: colors.danger },
  syncPanel: {
    gap: 12,
    padding: spacing.card,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceMuted,
  },
});
