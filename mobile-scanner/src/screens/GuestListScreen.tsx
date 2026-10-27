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

import type { StaffConcert, StaffGuestListEntry } from '../api';
import { BottomNav, EmptyState, ErrorBanner, Header, Screen, SecondaryButton, StatusBadge } from '../ui/components';
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
  onNavigate: (screen: 'overview' | 'scanner' | 'data' | 'guestlist') => void;
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
  onNavigate,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'CHECKED_IN'>('ALL');

  const checkedInCount = guestList.filter((guest) => Boolean(guest.checkedInAt)).length;
  const pendingCount = guestList.length - checkedInCount;

  const filteredGuests = useMemo(() => {
    const query = searchQuery.toLocaleLowerCase('vi').trim();
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
      ].filter(Boolean).join(' ').toLocaleLowerCase('vi');
      return matchesFilter && (!query || haystack.includes(query));
    });
  }, [filter, guestList, searchQuery]);

  function confirmCheckIn(guest: StaffGuestListEntry) {
    if (guest.checkedInAt) return;
    if (!isOnline) {
      Alert.alert('Đang offline', 'Điểm danh khách mời cần kết nối mạng để cập nhật lên server.');
      return;
    }
    Alert.alert(
      'Điểm danh khách mời',
      `Xác nhận ${guest.fullName} vào cổng ${gate.trim() || 'VIP'}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Điểm danh', onPress: () => onCheckInGuest(guest) },
      ],
    );
  }

  return (
    <Screen footer={<BottomNav active="guestlist" onChange={onNavigate} showGuestList />}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={filteredGuests}
        keyExtractor={(item) => item.guestId}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.topActions}>
              <SecondaryButton label="‹ Tổng quan" onPress={onBack} />
              <StatusBadge label={isOnline ? 'Online' : 'Offline'} tone={isOnline ? 'success' : 'warning'} />
            </View>
            <Header
              eyebrow="Guest List"
              title={concert.title}
              subtitle={`${guestList.length} khách mời · cổng ${gate.trim() || 'VIP'}`}
            />
            {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

            <View style={styles.stats}>
              <GuestMetric label="Chưa vào" value={pendingCount} tone="warning" />
              <GuestMetric label="Đã vào" value={checkedInCount} tone="success" />
            </View>

            <TextInput
              autoCapitalize="none"
              style={styles.searchInput}
              placeholder="Tìm tên, SĐT, hạng hoặc sponsor..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />

            <View style={styles.filters}>
              <FilterChip active={filter === 'ALL'} label="Tất cả" onPress={() => setFilter('ALL')} />
              <FilterChip active={filter === 'PENDING'} label="Chưa vào" onPress={() => setFilter('PENDING')} />
              <FilterChip active={filter === 'CHECKED_IN'} label="Đã vào" onPress={() => setFilter('CHECKED_IN')} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Không có khách mời"
            message="Đổi bộ lọc hoặc tải lại danh sách khách mời từ màn Tổng quan."
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
                  label={checkedIn ? 'Đã vào' : 'Chờ điểm danh'}
                  tone={checkedIn ? 'success' : 'warning'}
                />
              </View>

              <View style={styles.metaGrid}>
                <Meta label="Hạng" value={item.category || 'Khách mời'} />
                <Meta label="Đơn vị mời" value={item.sponsorName || 'Không ghi'} />
              </View>

              {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}

              <View style={styles.footerRow}>
                <Text style={styles.checkinMeta}>
                  {checkedIn
                    ? `${formatDateTime(item.checkedInAt!)} · ${item.checkinGate || 'VIP'}`
                    : isOnline
                      ? `Sẵn sàng điểm danh tại cổng ${gate.trim() || 'VIP'}`
                      : 'Cần online để điểm danh khách mời'}
                </Text>
                <View style={[styles.checkInButton, checkedIn && styles.checkInButtonDone]}>
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={[styles.checkInButtonText, checkedIn && styles.checkInButtonDoneText]}>
                      {checkedIn ? 'Hoàn tất' : isOnline ? 'Điểm danh' : 'Offline'}
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

function GuestMetric({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, tone === 'success' ? styles.successText : styles.warningText]}>{value}</Text>
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
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
    minHeight: 38,
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
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.accent,
  },
  checkInButtonDone: { backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.success },
  checkInButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  checkInButtonDoneText: { color: colors.success },
});
