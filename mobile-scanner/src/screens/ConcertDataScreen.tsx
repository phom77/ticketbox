import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ServerCheckinHistory, StaffConcert, StaffTicket } from '../api';
import type { LocalCheckinLog, LocalTicketListItem } from '../database';
import { BottomNav, EmptyState, ErrorBanner, Header, Screen, StatusBadge } from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

type Props = {
  concert: StaffConcert;
  localTickets: LocalTicketListItem[];
  serverTickets: StaffTicket[];
  localLogs: LocalCheckinLog[];
  serverHistory: ServerCheckinHistory[];
  isOnline: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
  onNavigate: (screen: 'overview' | 'scanner' | 'data' | 'guestlist') => void;
};

export function ConcertDataScreen(props: Props) {
  const [tab, setTab] = useState<'tickets' | 'history'>('tickets');
  const [query, setQuery] = useState('');
  const [ticketStatus, setTicketStatus] = useState<TicketStatusFilter>('ALL');
  const normalizedQuery = query.trim().toLowerCase();

  const tickets = useMemo(() => {
    const source = props.localTickets.length ? props.localTickets : props.serverTickets;
    return source.filter((item) => {
      const qrCode = 'qrCode' in item ? item.qrCode : '';
      const ticketId = 'ticketId' in item ? item.ticketId : '';
      const matchesQuery =
        !normalizedQuery ||
        qrCode.toLowerCase().includes(normalizedQuery) ||
        ticketId.toLowerCase().includes(normalizedQuery);
      return matchesQuery && matchesTicketStatus(item, ticketStatus);
    });
  }, [normalizedQuery, props.localTickets, props.serverTickets, ticketStatus]);

  const history = useMemo(() => {
    const serverQrCodes = new Set(
      props.serverHistory.map((log) => log.qrCode).filter((value): value is string => Boolean(value)),
    );
    const combined = [
      ...props.localLogs
        .filter((log) => log.status !== 'SYNCED' || !serverQrCodes.has(log.qrCode))
        .map((log) => ({ ...log, source: 'LOCAL' as const })),
      ...props.serverHistory.map((log) => ({ ...log, source: 'SERVER' as const })),
    ];
    return combined
      .filter((item) => {
        const qr = item.qrCode ?? '';
        return !normalizedQuery || qr.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime());
  }, [normalizedQuery, props.localLogs, props.serverHistory]);

  const data: DataItem[] =
    tab === 'tickets'
      ? tickets.map((item) => ({ kind: 'ticket', item }))
      : history.map((item) => ({ kind: 'history', item }));

  return (
    <Screen footer={<BottomNav active="data" onChange={props.onNavigate} />}>
      <FlatList
        contentContainerStyle={styles.content}
        data={data}
        keyExtractor={(entry, index) => {
          if (entry.kind === 'ticket') return `ticket-${entry.item.ticketId}`;
          return `history-${'localId' in entry.item ? entry.item.localId : entry.item.id}-${index}`;
        }}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Header
              eyebrow="Dữ liệu concert"
              title={props.concert.title}
              subtitle={props.isOnline ? 'Kết hợp dữ liệu local và server.' : 'Đang hiển thị dữ liệu đã lưu trên thiết bị.'}
            />
            <View style={styles.tabs}>
              <Tab active={tab === 'tickets'} label="Danh sách vé" onPress={() => setTab('tickets')} />
              <Tab active={tab === 'history'} label="Lịch sử quét" onPress={() => setTab('history')} />
            </View>
            <TextInput
              autoCapitalize="none"
              onChangeText={setQuery}
              placeholder="Tìm QR hoặc mã vé"
              placeholderTextColor={colors.textMuted}
              style={styles.search}
              value={query}
            />
            {tab === 'tickets' ? (
              <ScrollView
                contentContainerStyle={styles.filters}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {TICKET_STATUS_FILTERS.map((filter) => (
                  <FilterChip
                    active={ticketStatus === filter.value}
                    key={filter.value}
                    label={filter.label}
                    onPress={() => setTicketStatus(filter.value)}
                  />
                ))}
              </ScrollView>
            ) : null}
            {props.errorMessage ? <ErrorBanner message={props.errorMessage} /> : null}
            {props.isLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.meta}>Đang làm mới dữ liệu...</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={tab === 'tickets' ? 'Chưa có danh sách vé' : 'Chưa có lịch sử quét'}
            message={tab === 'tickets' ? 'Tải dataset để xem vé trên thiết bị.' : 'Lịch sử sẽ xuất hiện sau lần quét đầu tiên.'}
          />
        }
        renderItem={({ item }) =>
          item.kind === 'ticket'
            ? <TicketRow item={item.item} />
            : <HistoryRow item={item.item} />
        }
        refreshing={props.isLoading}
        onRefresh={props.onRefresh}
      />
    </Screen>
  );
}

type HistoryItem =
  | (LocalCheckinLog & { source: 'LOCAL' })
  | (ServerCheckinHistory & { source: 'SERVER' });

type DataItem =
  | { kind: 'ticket'; item: LocalTicketListItem | StaffTicket }
  | { kind: 'history'; item: HistoryItem };

type TicketStatusFilter = 'ALL' | 'VALID' | 'CHECKED_IN' | 'PENDING' | 'ERROR';

const TICKET_STATUS_FILTERS: { label: string; value: TicketStatusFilter }[] = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Hợp lệ', value: 'VALID' },
  { label: 'Đã check-in', value: 'CHECKED_IN' },
  { label: 'Chờ sync', value: 'PENDING' },
  { label: 'Lỗi', value: 'ERROR' },
];

function Tab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function matchesTicketStatus(
  item: LocalTicketListItem | StaffTicket,
  filter: TicketStatusFilter,
) {
  if (filter === 'ALL') return true;

  const status = 'checkinStatus' in item ? item.checkinStatus ?? 'VALID_LOCAL' : item.status;
  if (filter === 'VALID') return status === 'VALID' || status === 'VALID_LOCAL';
  if (filter === 'CHECKED_IN') return status === 'USED' || status === 'SYNCED';
  if (filter === 'PENDING') return status === 'PENDING';
  return ['FAILED', 'CONFLICT', 'CANCELLED', 'TRANSFERRED'].includes(status);
}

function TicketRow({ item }: { item: LocalTicketListItem | StaffTicket }) {
  const isLocal = 'checkinStatus' in item;
  const status = isLocal ? item.checkinStatus ?? 'VALID_LOCAL' : item.status;
  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.code}>{shortCode(item.qrCode)}</Text>
        <Text style={styles.meta}>Ticket {shortCode(item.ticketId)}</Text>
        <Text style={styles.meta}>Loại vé {shortCode(item.ticketTypeId)}</Text>
      </View>
      <StatusBadge label={status} tone={ticketTone(status)} />
    </View>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const status = item.source === 'LOCAL' ? item.status : item.ticketStatus ?? 'CHECKED_IN';
  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.code}>{shortCode(item.qrCode ?? '')}</Text>
        <Text style={styles.meta}>{formatDateTime(item.checkedAt)} · Cổng {item.gate || '-'}</Text>
        <Text style={styles.meta}>{item.source === 'LOCAL' ? 'Thiết bị local' : item.offline ? 'Server · offline sync' : 'Server · online'}</Text>
        {item.source === 'LOCAL' && item.syncReason ? <Text style={styles.reason}>{item.syncReason}</Text> : null}
      </View>
      <StatusBadge label={status} tone={ticketTone(status)} />
    </View>
  );
}

function ticketTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (['USED', 'SYNCED', 'CHECKED_IN'].includes(status)) return 'success';
  if (['PENDING', 'CONFLICT'].includes(status)) return 'warning';
  if (['FAILED', 'CANCELLED', 'TRANSFERRED'].includes(status)) return 'danger';
  return 'neutral';
}

function shortCode(value: string) {
  if (!value) return 'Không có QR';
  return value.length > 28 ? `${value.slice(0, 14)}…${value.slice(-8)}` : value;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN');
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, gap: 0 },
  headerBlock: { gap: 14, marginBottom: 10 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radius.input, backgroundColor: colors.surfaceMuted },
  tab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: colors.accent, fontWeight: '900' },
  filters: { gap: 8, paddingRight: spacing.screen },
  filterChip: {
    minHeight: 38,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  filterChipActive: { borderColor: colors.accent, backgroundColor: colors.surfaceMuted },
  filterChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  filterChipTextActive: { color: colors.accent, fontWeight: '900' },
  search: {
    minHeight: 48,
    paddingHorizontal: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
  },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowCopy: { flex: 1, gap: 4 },
  code: { color: colors.text, fontSize: 14, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  reason: { color: colors.danger, fontSize: 12, lineHeight: 17 },
});
