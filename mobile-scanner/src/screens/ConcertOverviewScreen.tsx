import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { StaffConcert, StaffConcertOverview } from '../api';
import type { DatasetInfo, LogStatusCounts } from '../database';
import type { PendingSyncSummary } from '../features/sync';
import {
  BottomNav,
  ErrorBanner,
  Header,
  PrimaryButton,
  Screen,
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
  isOnline: boolean;
  isLoading: boolean;
  isDownloading: boolean;
  isSyncing: boolean;
  errorMessage: string | null;
  syncSummary: PendingSyncSummary | null;
  onChangeGate: (gate: string) => void;
  onBack: () => void;
  onDownloadDataset: () => void;
  onSync: () => void;
  onDownloadGuestList: () => void;
  onNavigate: (screen: 'overview' | 'scanner' | 'data' | 'guestlist') => void;
  hasGuestList: boolean;
  isDownloadingGuestList: boolean;
};

export function ConcertOverviewScreen(props: Props) {
  const hasDataset = Boolean(props.datasetInfo.downloadedAt);
  const hasUpdate = Boolean(
    props.overview?.datasetUpdatedAt &&
      props.datasetInfo.downloadedAt &&
      new Date(props.overview.datasetUpdatedAt) > new Date(props.datasetInfo.downloadedAt),
  );

  return (
    <Screen footer={<BottomNav active="overview" onChange={props.onNavigate} showGuestList={props.hasGuestList} />}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topActions}>
          <SecondaryButton label="‹ Concerts" onPress={props.onBack} />
          <StatusBadge label={props.isOnline ? 'Online' : 'Offline'} tone={props.isOnline ? 'success' : 'warning'} />
        </View>

        {props.errorMessage ? <ErrorBanner message={props.errorMessage} /> : null}

        <View style={styles.field}>
          <Text style={styles.label}>Cổng đang làm việc</Text>
          <TextInput
            autoCapitalize="characters"
            onChangeText={props.onChangeGate}
            placeholder="A, B, VIP..."
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={props.gate}
          />
        </View>

        <View style={styles.metrics}>
          <Metric label="Tổng vé" value={props.overview?.totalTickets ?? props.datasetInfo.totalCount} />
          <Metric label="Đã check-in" value={props.overview?.totalCheckins ?? 0} />
          <Metric label="Chờ sync" value={props.counters.PENDING} tone="warning" />
          <Metric label="Xung đột/lỗi" value={props.counters.CONFLICT + props.counters.FAILED} tone="danger" />
        </View>

        <PrimaryButton
          disabled={!hasDataset && !props.isOnline}
          label="Bắt đầu quét"
          onPress={() => props.onNavigate('scanner')}
        />

        <View style={styles.datasetPanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Dataset trên thiết bị</Text>
              <Text style={styles.helper}>
                {hasDataset
                  ? `${props.datasetInfo.totalCount} vé · tải ${formatDateTime(props.datasetInfo.downloadedAt!)}`
                  : 'Chưa có dữ liệu local để quét offline.'}
              </Text>
            </View>
            <StatusBadge
              label={hasUpdate ? 'Có cập nhật' : hasDataset ? 'Sẵn sàng' : 'Chưa tải'}
              tone={hasUpdate ? 'warning' : hasDataset ? 'success' : 'neutral'}
            />
          </View>
          <PrimaryButton
            disabled={!props.isOnline}
            label={hasDataset ? 'Cập nhật dataset' : 'Tải dataset'}
            loading={props.isDownloading}
            onPress={props.onDownloadDataset}
          />
        </View>

        <View style={styles.datasetPanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Danh sách khách mời</Text>
              <Text style={styles.helper}>
                {props.hasGuestList
                  ? 'Đã tải danh sách khách mời.'
                  : 'Chưa có dữ liệu khách mời.'}
              </Text>
            </View>
            <StatusBadge
              label={props.hasGuestList ? 'Sẵn sàng' : 'Chưa tải'}
              tone={props.hasGuestList ? 'success' : 'neutral'}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                disabled={!props.isOnline}
                label="Tải khách mời"
                loading={props.isDownloadingGuestList}
                onPress={props.onDownloadGuestList}
              />
            </View>
            {props.hasGuestList && (
              <View style={{ flex: 1 }}>
                <SecondaryButton
                  label="Xem danh sách"
                  onPress={() => props.onNavigate('guestlist')}
                />
              </View>
            )}
          </View>
        </View>

        <View style={styles.syncPanel}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Đồng bộ lượt quét offline</Text>
            <Text style={styles.helper}>
              {props.counters.PENDING
                ? `${props.counters.PENDING} lượt đang chờ gửi lên server.`
                : 'Không có lượt quét nào đang chờ.'}
            </Text>
          </View>
          <SecondaryButton
            disabled={!props.isOnline || props.isSyncing}
            label={props.isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
            onPress={props.onSync}
          />
          {props.syncSummary ? (
            <Text style={styles.helper}>
              Gần nhất: {props.syncSummary.accepted} accepted, {props.syncSummary.skipped} skipped, {props.syncSummary.invalid} invalid.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
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
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, tone === 'warning' && styles.warning, tone === 'danger' && styles.danger]}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, gap: spacing.section },
  topActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
