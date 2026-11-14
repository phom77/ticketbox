import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { formatDateTime, useScannerLanguage } from '../i18n';
import type { StaffConcert, StaffGuestListEntry } from '../api';
import { EmptyState, ErrorBanner, Header, SecondaryButton, StatusBadge } from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

type Props = {
  concert: StaffConcert;
  guestList: StaffGuestListEntry[];
  gate: string;
  isOnline: boolean;
  checkingInGuestId: string | null;
  errorMessage: string | null;
  onBack: () => void;
  onCheckInGuest: (guest: StaffGuestListEntry) => void;
};

export function GuestListScreen({
  concert,
  guestList,
  gate,
  isOnline,
  checkingInGuestId,
  errorMessage,
  onBack,
  onCheckInGuest,
}: Props) {
  const { t, locale, number } = useScannerLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'CHECKED_IN'>('ALL');

  const checkedInCount = guestList.filter((guest) => Boolean(guest.checkedInAt)).length;
  const pendingCount = guestList.length - checkedInCount;

  const filteredGuests = useMemo(() => {
    const query = searchQuery.toLocaleLowerCase(locale).trim();
    return guestList.filter((guest) => {
      const checkedIn = Boolean(guest.checkedInAt);
      const matchesFilter =
        filter === 'ALL' ||
        (filter === 'CHECKED_IN' && checkedIn) ||
        (filter === 'PENDING' && !checkedIn);
      const haystack = [
        guest.fullName,
        guest.phone,
        guest.category,
        guest.sponsorName,
        guest.notes,
      ].filter(Boolean).join(' ').toLocaleLowerCase(locale);
      return matchesFilter && (!query || haystack.includes(query));
    });
  }, [filter, guestList, locale, searchQuery]);

  function confirmCheckIn(guest: StaffGuestListEntry) {
    if (guest.checkedInAt) return;
    if (!isOnline) {
      Alert.alert(t('deviceOffline'), t('guestNeedsNetwork'));
      return;
    }
    Alert.alert(
      t('guestCheckin'),
      t('confirmGuest', { name: guest.fullName, gate: gate.trim() }),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('guestAction'), onPress: () => onCheckInGuest(guest) },
      ],
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={filteredGuests}
      keyExtractor={(item) => item.guestId}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <View style={styles.topActions}>
            <SecondaryButton label={t('backOverview')} onPress={onBack} />
            <StatusBadge label={isOnline ? t('connected') : t('disconnected')} tone={isOnline ? 'neutral' : 'warning'} />
          </View>
          <Header
            title={concert.title}
            subtitle={t('guestCount', { count: number(guestList.length), gate: gate.trim() })}
          />
          {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

          <View style={styles.stats}>
            <GuestMetric label={t('guestNotAdmitted')} value={pendingCount} tone="warning" />
            <GuestMetric label={t('guestAdmitted')} value={checkedInCount} tone="success" />
          </View>

          <TextInput
            autoCapitalize="none"
            style={styles.searchInput}
            placeholder={t('guestSearch')}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          <View style={styles.filters}>
            <FilterChip active={filter === 'ALL'} label={t('all')} onPress={() => setFilter('ALL')} />
            <FilterChip active={filter === 'PENDING'} label={t('guestNotAdmitted')} onPress={() => setFilter('PENDING')} />
            <FilterChip active={filter === 'CHECKED_IN'} label={t('guestAdmitted')} onPress={() => setFilter('CHECKED_IN')} />
          </View>
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          title={t('noGuests')}
          message={t('guestEmpty')}
        />
      }
      renderItem={({ item }) => {
        const checkedIn = Boolean(item.checkedInAt);
        const isLoading = checkingInGuestId === item.guestId;
        return (
          <Pressable
            accessibilityRole="button"
            disabled={checkedIn || isLoading}
            onPress={() => confirmCheckIn(item)}
            style={({ pressed }) => [
              styles.guestCard,
              checkedIn && styles.guestCardChecked,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.guestHeader}>
              <View style={styles.guestCopy}>
                <Text numberOfLines={1} style={styles.guestName}>{item.fullName}</Text>
                <Text style={styles.guestPhone}>{item.phone}</Text>
              </View>
              <StatusBadge
                label={checkedIn ? t('guestAdmitted') : t('guestPending')}
                tone={checkedIn ? 'success' : 'warning'}
              />
            </View>

            <View style={styles.metaGrid}>
              <Meta label={t('category')} value={item.category || t('guests')} />
              <Meta label={t('sponsor')} value={item.sponsorName || t('unspecified')} />
            </View>

            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}

            <View style={styles.footerRow}>
              <Text style={styles.checkinMeta}>
                {checkedIn
                  ? `${formatDateTime(item.checkedInAt!, locale)} · ${item.checkinGate || 'VIP'}`
                  : isOnline
                    ? t('guestReady', { gate: gate.trim() })
                    : t('guestOffline')}
              </Text>
              <View style={[styles.checkInButton, checkedIn && styles.checkInButtonDone]}>
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={[styles.checkInButtonText, checkedIn && styles.checkInButtonDoneText]}>
                    {checkedIn ? t('done') : isOnline ? t('guestAction') : t('offline')}
                  </Text>
                )}
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

function GuestMetric({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' }) {
  const { number } = useScannerLanguage();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, tone === 'success' ? styles.successText : styles.warningText]}>{number(value)}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function FilterChip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: spacing.screen, gap: 12 },
  headerBlock: { gap: 14, marginBottom: 4 },
  topActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stats: { flexDirection: 'row', gap: 10 },
  metric: {
    flex: 1,
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  metricValue: { fontSize: 28, fontWeight: '900' },
  metricLabel: { marginTop: 3, color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  successText: { color: colors.success },
  warningText: { color: colors.warning },
  searchInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  filters: { flexDirection: 'row', gap: 8 },
  filterChip: {
    minHeight: 48,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  filterChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  filterChipTextActive: { color: colors.accent },
  guestCard: {
    gap: 13,
    padding: 15,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  guestCardChecked: { borderColor: colors.success, backgroundColor: colors.successSoft },
  cardPressed: { opacity: 0.76 },
  guestHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  guestCopy: { flex: 1, gap: 3 },
  guestName: { fontSize: 17, fontWeight: '900', color: colors.text },
  guestPhone: { fontSize: 13, color: colors.textMuted, fontWeight: '700' },
  metaGrid: { flexDirection: 'row', gap: 10 },
  metaItem: { flex: 1, gap: 3 },
  metaLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  metaValue: { color: colors.text, fontSize: 14, fontWeight: '800' },
  notes: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkinMeta: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  checkInButton: {
    minWidth: 104,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.accent,
  },
  checkInButtonDone: { backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.success },
  checkInButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  checkInButtonDoneText: { color: colors.success },
});
