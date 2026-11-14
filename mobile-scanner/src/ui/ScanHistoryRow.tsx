import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { HistoryEntry } from '../features/checkin/history';
import { admissionStatus } from '../features/checkin/status';
import { colors } from './theme';

export function ScanHistoryRow({ item, compact = false }: { item: HistoryEntry; compact?: boolean }) {
  const status = admissionStatus[item.status];
  const color = colors[status.tone];
  const surface = colors[`${status.tone}Soft`];
  const time = new Date(item.checkedAt).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: compact ? undefined : '2-digit',
    day: compact ? undefined : '2-digit', month: compact ? undefined : '2-digit',
  });

  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: surface }]}>
        <MaterialIcons name={status.icon} size={19} color={color} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, { color }]}>{status.label}</Text>
        <Text style={styles.meta}>
          {time}{item.gate ? ` · Cổng ${item.gate}` : ''}
        </Text>
        {!compact && item.ticketId ? <Text style={styles.meta}>Mã vé {item.ticketId}</Text> : null}
        {!compact && !item.ticketId && item.qrCode ? <Text style={styles.meta}>QR đã ẩn</Text> : null}
        {!compact && item.status !== 'confirmed' && item.reason ? <Text style={styles.meta}>{item.reason}</Text> : null}
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
