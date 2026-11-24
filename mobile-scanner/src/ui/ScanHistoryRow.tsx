import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useScannerLanguage } from '../i18n';
import type { HistoryEntry } from '../features/checkin/history';
import { admissionStatus } from '../features/checkin/status';
import { colors } from './theme';

export function ScanHistoryRow({ item, compact = false }: { item: HistoryEntry; compact?: boolean }) {
  const { t, locale } = useScannerLanguage();
  const status = admissionStatus[item.status];
  const color = colors[status.tone];
  const surface = colors[`${status.tone}Soft`];
  const time = new Date(item.checkedAt).toLocaleString(locale, {
    hour: '2-digit', minute: '2-digit', second: compact ? undefined : '2-digit',
    day: compact ? undefined : '2-digit', month: compact ? undefined : '2-digit',
  });

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: surface }]}>
        <MaterialIcons name={status.icon} size={19} color={color} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, { color }]}>{t(status.label)}</Text>
        <Text style={styles.meta}>
          {time}{item.gate ? ` · ${t('gate', { value: item.gate })}` : ''}
        </Text>
        {!compact && item.referenceCode ? <Text style={styles.meta}>{t('ticketId', { value: item.referenceCode })}</Text> : null}
        {!compact && item.ticketTypeName ? <Text style={styles.meta}>{t('ticketType', { value: item.ticketTypeName })}</Text> : null}
        {!compact && (item.status === 'conflict' || item.status === 'failed') ? (
          <Text style={styles.meta}>{t(item.status === 'conflict' ? 'syncReasonConflict' : 'syncReasonFailed')}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  icon: { alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 12 },
  copy: { flex: 1, gap: 4 },
  label: { fontSize: 14, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 13 },
});
