import { useState } from 'react';
import {
  ActivityIndicator,
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

import { formatDateTime, useScannerLanguage } from '../i18n';
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
import { LanguageSelect } from '../ui/LanguageSelect';
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
  const { t, locale, number } = useScannerLanguage();
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
              title={t('selectEvent')}
              subtitle={t('welcome', { name: user.fullName })}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <StatusBadge label={isOnline ? t('connected') : t('disconnected')} tone={isOnline ? 'neutral' : 'warning'} />
                  <Pressable accessibilityRole="button" accessibilityLabel={t('logout')} onPress={onLogout} style={styles.iconButton}>
                    <MaterialIcons name="logout" size={24} color={colors.danger} />
                  </Pressable>
                </View>
              }
            />
            <LanguageSelect />
            {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
            <View style={styles.filters}>
              <TextInput
                style={styles.searchInput}
                placeholder={t('eventSearch')}
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <Pressable accessibilityRole="button" style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                <MaterialIcons name="date-range" size={20} color={colors.accent} />
                <Text style={styles.datePickerText}>
                  {searchDate ? searchDate.toLocaleDateString(locale) : t('filterDate')}
                </Text>
              </Pressable>
              {searchDate ? (
                <Pressable accessibilityRole="button" accessibilityLabel={t('clearDate')} style={styles.clearDateBtn} onPress={() => setSearchDate(null)}>
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
              <Text style={styles.muted}>{t('loadingEvents')}</Text>
            </View>
          ) : (
            <EmptyState
              title={t('noEvents')}
              message={
                isOnline
                  ? t('noOnSaleEvents')
                  : t('noCachedEvents')
              }
            />
          )
        }
        renderItem={({ item }) => {
          const localDataset = datasetInfo[item.id];
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => onSelectConcert(item)}
              style={({ pressed }) => [styles.concertRow, pressed && styles.pressed]}
            >
              <View style={styles.dateBlock}>
                <Text style={styles.dateDay}>{formatDay(item.eventDate, locale)}</Text>
                <Text style={styles.dateMonth}>{formatMonth(item.eventDate, locale)}</Text>
              </View>
              <View style={styles.concertCopy}>
                <Text numberOfLines={2} style={styles.concertTitle}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.meta}>{item.venueName}</Text>
                <Text style={styles.meta}>{formatDateTime(item.eventDate, locale)}</Text>
                <View style={styles.badges}>
                  <StatusBadge label={t(eventStatusLabels[item.status])} tone="success" />
                  <StatusBadge
                    label={localDataset?.downloadedAt ? t('ticketCount', { count: number(localDataset.totalCount) }) : t('noTicketData')}
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

const eventStatusLabels = {
  ON_SALE: 'onSale', SOLD_OUT: 'soldOut', COMPLETED: 'completed', CANCELLED: 'cancelled',
} as const;

function formatDay(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale, { day: '2-digit' });
}

function formatMonth(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale, { month: 'short' }).replace('.', '');
}

const styles = StyleSheet.create({
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
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
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  searchInput: { flex: 1, minWidth: 124, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.input, paddingHorizontal: 12, color: colors.text, backgroundColor: colors.surface },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.input, paddingHorizontal: 10, backgroundColor: colors.surface },
  datePickerText: { color: colors.text, fontSize: 13 },
  clearDateBtn: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
