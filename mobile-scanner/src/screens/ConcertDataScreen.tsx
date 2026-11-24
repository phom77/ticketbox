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

import { useScannerLanguage, type MessageKey } from '../i18n';
import type { StaffConcert, StaffTicket } from '../api';
import type { LocalTicketListItem } from '../database';
import { EmptyState, ErrorBanner, Header, SecondaryButton, StatusBadge } from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

type Props = {
  concert: StaffConcert;
  localTickets: LocalTicketListItem[];
  serverTickets: StaffTicket[];
  isOnline: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
};

export function ConcertDataScreen(props: Props) {
  const { t } = useScannerLanguage();
  const [query, setQuery] = useState('');
  const [ticketStatus, setTicketStatus] = useState<TicketStatusFilter>('ALL');
  const normalizedQuery = query.trim().toLowerCase();

  const tickets = useMemo(() => {
    const source = props.localTickets.length ? props.localTickets : props.serverTickets;
    return source.filter((item) => {
      const { qrCode, referenceCode } = item;
      const matchesQuery =
        !normalizedQuery ||
        qrCode.toLowerCase().includes(normalizedQuery) ||
        referenceCode?.toLowerCase().includes(normalizedQuery);
      return matchesQuery && matchesTicketStatus(item, ticketStatus);
    });
  }, [normalizedQuery, props.localTickets, props.serverTickets, ticketStatus]);

  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={tickets}
      keyExtractor={(ticket) => ticket.ticketId}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <Header
            title={props.concert.title}
            subtitle={props.isOnline ? t('loadedTickets') : t('localTickets')}
          />
          <TextInput
            accessibilityLabel={t('ticketSearch')}
            autoCapitalize="none"
            onChangeText={setQuery}
            placeholder={t('searchCodes')}
            placeholderTextColor={colors.textMuted}
            style={styles.search}
            value={query}
          />
          <ScrollView
            contentContainerStyle={styles.filters}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {TICKET_STATUS_FILTERS.map((filter) => (
              <FilterChip
                active={ticketStatus === filter.value}
                key={filter.value}
                label={t(filter.label)}
                onPress={() => setTicketStatus(filter.value)}
              />
            ))}
          </ScrollView>
          {props.errorMessage ? (
            <>
              <ErrorBanner message={props.errorMessage} />
              <SecondaryButton label={t('reloadTickets')} disabled={props.isLoading} onPress={props.onRefresh} />
            </>
          ) : null}
          {props.isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.meta}>{t('loadingTickets')}</Text>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={!props.isLoading ? (
        <EmptyState
          title={query.trim() || ticketStatus !== 'ALL' ? t('noMatchingTickets') : t('noTickets')}
          message={query.trim() || ticketStatus !== 'ALL'
            ? t('tryFilters') : t('downloadFromOverview')}
        />
      ) : null}
      renderItem={({ item }) => <TicketRow item={item} />}
      refreshing={props.isLoading}
      onRefresh={props.onRefresh}
    />
  );
}

type TicketStatusFilter = 'ALL' | 'VALID' | 'CHECKED_IN' | 'PENDING' | 'ERROR';

const TICKET_STATUS_FILTERS: { label: MessageKey; value: TicketStatusFilter }[] = [
  { label: 'all', value: 'ALL' },
  { label: 'valid', value: 'VALID' },
  { label: 'confirmed', value: 'CHECKED_IN' },
  { label: 'pending', value: 'PENDING' },
  { label: 'error', value: 'ERROR' },
];

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
  const { t } = useScannerLanguage();
  const isLocal = 'checkinStatus' in item;
  const status = isLocal ? item.checkinStatus ?? 'VALID_LOCAL' : item.status;
  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.code}>{item.referenceCode ? t('ticketId', { value: item.referenceCode })
          : item.ticketTypeName ?? t('ticketWithoutReference')}</Text>
        {item.referenceCode && item.ticketTypeName ? (
          <Text style={styles.meta}>{t('ticketType', { value: item.ticketTypeName })}</Text>
        ) : null}
      </View>
      <StatusBadge label={t(ticketLabels[status])} tone={ticketTone(status)} />
    </View>
  );
}

const ticketLabels = {
  VALID: 'valid', VALID_LOCAL: 'cached', USED: 'used',
  SYNCED: 'confirmed', PENDING: 'pending', CONFLICT: 'conflict',
  FAILED: 'error', CANCELLED: 'cancelled', TRANSFERRED: 'transferred',
} as const;

function ticketTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (['USED', 'SYNCED', 'CHECKED_IN'].includes(status)) return 'success';
  if (['PENDING', 'CONFLICT'].includes(status)) return 'warning';
  if (['FAILED', 'CANCELLED', 'TRANSFERRED'].includes(status)) return 'danger';
  return 'neutral';
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, gap: 0 },
  headerBlock: { gap: 14, marginBottom: 10 },
  filters: { gap: 8, paddingRight: spacing.screen },
  filterChip: {
    minHeight: 48,
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
});
