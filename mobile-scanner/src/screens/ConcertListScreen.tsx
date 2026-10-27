import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';

import type { StaffConcert, StaffUser } from '../api';
import type { DatasetInfo } from '../database';
import {
  EmptyState,
  ErrorBanner,
  Header,
  Screen,
  SecondaryButton,
  StatusBadge,
} from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

type Props = {
  user: StaffUser;
  concerts: StaffConcert[];
  datasetInfo: Record<string, DatasetInfo>;
  isLoading: boolean;
  isOnline: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
  onSelectConcert: (concert: StaffConcert) => void;
  onLogout: () => void;
};

export function ConcertListScreen({
  user,
  concerts,
  datasetInfo,
  isLoading,
  isOnline,
  errorMessage,
  onRefresh,
  onSelectConcert,
  onLogout,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDate, setSearchDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const filteredConcerts = concerts.filter((concert) => {
    const matchesQuery = concert.title.toLowerCase().includes(searchQuery.toLowerCase());
    let matchesDate = true;
    if (searchDate) {
      const concertDate = new Date(concert.eventDate);
      matchesDate =
        concertDate.getDate() === searchDate.getDate() &&
        concertDate.getMonth() === searchDate.getMonth() &&
        concertDate.getFullYear() === searchDate.getFullYear();
    }
    return matchesQuery && matchesDate;
  });

  const handleSelectConcert = (concert: StaffConcert) => {
    Alert.alert(
      'Xác nhận',
      `Bạn có chắc chắn muốn chọn concert "${concert.title}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Chọn', onPress: () => onSelectConcert(concert) },
      ]
    );
  };

  return (
    <Screen>
      <FlatList
        contentContainerStyle={styles.content}
        data={filteredConcerts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Header
              eyebrow="TicketBox Scanner"
              title="Chọn concert"
              subtitle={`Xin chào ${user.fullName}. Chọn concert trước khi tải dữ liệu và quét vé.`}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <StatusBadge label={isOnline ? 'Online' : 'Offline'} tone={isOnline ? 'success' : 'warning'} />
                  <Pressable onPress={onLogout} style={{ padding: 4 }}>
                    <MaterialIcons name="logout" size={24} color={colors.danger} />
                  </Pressable>
                </View>
              }
            />
            {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
            <View style={styles.filters}>
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm tên concert..."
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <Pressable style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                <MaterialIcons name="date-range" size={20} color={colors.accent} />
                <Text style={styles.datePickerText}>
                  {searchDate ? searchDate.toLocaleDateString('vi-VN') : 'Lọc theo ngày'}
                </Text>
              </Pressable>
              {searchDate ? (
                <Pressable style={styles.clearDateBtn} onPress={() => setSearchDate(null)}>
                  <MaterialIcons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            {showDatePicker && (
              <DateTimePicker
                value={searchDate || new Date()}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  if (date) setSearchDate(date);
                }}
              />
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.muted}>Đang tải danh sách concert...</Text>
            </View>
          ) : (
            <EmptyState
              title="Chưa có concert"
              message={
                isOnline
                  ? 'Không có concert ON_SALE để quét.'
                  : 'Thiết bị chưa cache concert nào. Hãy kết nối mạng và tải lại.'
              }
            />
          )
        }
        renderItem={({ item }) => {
          const localDataset = datasetInfo[item.id];
          return (
            <Pressable
              onPress={() => handleSelectConcert(item)}
              style={({ pressed }) => [styles.concertRow, pressed && styles.pressed]}
            >
              <View style={styles.dateBlock}>
                <Text style={styles.dateDay}>{formatDay(item.eventDate)}</Text>
                <Text style={styles.dateMonth}>{formatMonth(item.eventDate)}</Text>
              </View>
              <View style={styles.concertCopy}>
                <Text numberOfLines={2} style={styles.concertTitle}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.meta}>{item.venueName}</Text>
                <Text style={styles.meta}>{formatDateTime(item.eventDate)}</Text>
                <View style={styles.badges}>
                  <StatusBadge label={item.status} tone="success" />
                  <StatusBadge
                    label={localDataset?.downloadedAt ? `${localDataset.totalCount} vé local` : 'Chưa tải dataset'}
                    tone={localDataset?.downloadedAt ? 'success' : 'neutral'}
                  />
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit' });
}

function formatMonth(value: string) {
  return new Date(value).toLocaleDateString('vi-VN', { month: 'short' }).replace('.', '');
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
  content: { padding: spacing.screen, gap: 12 },
  headerBlock: { gap: 14, marginBottom: 8 },
  loading: { padding: 40, alignItems: 'center', gap: 12 },
  muted: { color: colors.textMuted, fontSize: 14 },
  concertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  dateBlock: {
    width: 56,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input,
    backgroundColor: colors.accentSoft,
  },
  dateDay: { color: colors.accent, fontSize: 23, fontWeight: '900' },
  dateMonth: { color: colors.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  concertCopy: { flex: 1, gap: 4 },
  concertTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 13 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  chevron: { color: colors.textMuted, fontSize: 28, fontWeight: '300' },
  filters: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInput: { flex: 1, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: radius.input, paddingHorizontal: 12, color: colors.text, backgroundColor: colors.surface },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: radius.input, paddingHorizontal: 10, backgroundColor: colors.surface },
  datePickerText: { color: colors.text, fontSize: 13 },
  clearDateBtn: { padding: 4 },
});
