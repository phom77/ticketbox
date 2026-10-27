import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SCAN_DUPLICATE_WINDOW_MS, type StaffConcert } from '../api';
import type { LogStatusCounts } from '../database';
import type { ManualCheckinResult } from '../features/checkin';
import { BottomNav, Header, PrimaryButton, Screen, SecondaryButton, StatusBadge } from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

type Props = {
  concert: StaffConcert;
  gate: string;
  qrCode: string;
  counters: LogStatusCounts;
  isOnline: boolean;
  hasDataset: boolean;
  isCheckingIn: boolean;
  result: ManualCheckinResult | null;
  onChangeQrCode: (value: string) => void;
  onCheckin: () => void;
  onCameraQrScanned: (value: string) => void;
  onNavigate: (screen: 'overview' | 'scanner' | 'data' | 'guestlist') => void;
};

export function ScannerHomeScreen({
  concert,
  gate,
  qrCode,
  counters,
  isOnline,
  hasDataset,
  isCheckingIn,
  result,
  onChangeQrCode,
  onCheckin,
  onCameraQrScanned,
  onNavigate,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(true);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);
  const canScan = isOnline || hasDataset;

  return (
    <Screen footer={<BottomNav active="scanner" onChange={onNavigate} />}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Header
            eyebrow={gate ? `Cổng ${gate}` : 'Chưa chọn cổng'}
            title="Quét vé"
            subtitle={concert.title}
          />
          <StatusBadge label={isOnline ? 'Online' : 'Offline'} tone={isOnline ? 'success' : 'warning'} />
        </View>

        {!canScan ? (
          <View style={styles.blocked}>
            <Text style={styles.blockedTitle}>Chưa thể quét offline</Text>
            <Text style={styles.helper}>Hãy quay lại Tổng quan và tải dataset khi có mạng.</Text>
          </View>
        ) : null}

        {cameraActive ? (
          <View style={styles.cameraPanel}>
            {!permission ? (
              <View style={styles.cameraFallback}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.helper}>Đang kiểm tra quyền camera...</Text>
              </View>
            ) : null}
            {permission && !permission.granted ? (
              <View style={styles.cameraFallback}>
                <Text style={styles.helper}>Cần quyền camera để đọc mã QR.</Text>
                <SecondaryButton label="Cho phép camera" onPress={requestPermission} />
              </View>
            ) : null}
            {permission?.granted ? (
              <CameraView
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={isCheckingIn || !canScan ? undefined : handleBarcodeScanned}
                style={styles.camera}
              >
                <View style={styles.scanFrame} />
              </CameraView>
            ) : null}
          </View>
        ) : null}

        <View style={styles.tabContainer}>
          <Pressable
            style={[styles.tabButton, cameraActive && styles.tabButtonActive]}
            onPress={() => setCameraActive(true)}
          >
            <Text style={[styles.tabText, cameraActive && styles.tabTextActive]}>Quét mã QR</Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, !cameraActive && styles.tabButtonActive]}
            onPress={() => setCameraActive(false)}
          >
            <Text style={[styles.tabText, !cameraActive && styles.tabTextActive]}>Nhập tay</Text>
          </Pressable>
        </View>

        {!cameraActive && (
          <View style={styles.manualPanel}>
            <TextInput
              autoCapitalize="none"
              editable={!isCheckingIn && canScan}
              multiline
              onChangeText={onChangeQrCode}
              placeholder="Dán nội dung QR"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={qrCode}
            />
            <PrimaryButton
              disabled={!canScan || !qrCode.trim()}
              label={isOnline ? 'Check-in online' : 'Lưu check-in offline'}
              loading={isCheckingIn}
              onPress={onCheckin}
            />
          </View>
        )}

        {result ? (
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={[styles.result, resultTone(result.status)]}
          >
            <Text style={styles.resultTitle}>{resultLabel(result.status)}</Text>
            <Text style={styles.resultMessage}>{result.message}</Text>
            {result.checkedAt ? <Text style={styles.resultMeta}>{formatDateTime(result.checkedAt)}</Text> : null}
          </View>
        ) : null}

        <View style={styles.counters}>
          <Counter value={counters.PENDING} label="Chờ sync" />
          <Counter value={counters.SYNCED} label="Đã sync" />
          <Counter value={counters.CONFLICT + counters.FAILED} label="Lỗi" />
        </View>
      </ScrollView>
    </Screen>
  );

  function handleBarcodeScanned(scan: BarcodeScanningResult) {
    const value = scan.data.trim();
    const now = Date.now();
    if (!value) return;
    if (
      lastScanRef.current?.value === value &&
      now - lastScanRef.current.at < SCAN_DUPLICATE_WINDOW_MS
    ) return;
    lastScanRef.current = { value, at: now };
    onChangeQrCode(value);
    onCameraQrScanned(value);
  }
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.counter}>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

function resultTone(status: ManualCheckinResult['status']) {
  if (status === 'PENDING' || status === 'ONLINE_ACCEPTED') return styles.resultSuccess;
  if (status === 'DUPLICATE_LOCAL') return styles.resultWarning;
  return styles.resultDanger;
}

function resultLabel(status: ManualCheckinResult['status']) {
  const labels: Record<ManualCheckinResult['status'], string> = {
    PENDING: 'Đã lưu offline',
    ONLINE_ACCEPTED: 'Check-in thành công',
    DUPLICATE_LOCAL: 'Vé đã được quét',
    INVALID_LOCAL: 'Vé không hợp lệ',
    ONLINE_FAILED: 'Server từ chối',
  };
  return labels[status];
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('vi-VN');
}

const styles = StyleSheet.create({
  content: { padding: spacing.screen, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  blocked: { padding: 14, gap: 5, borderRadius: radius.card, backgroundColor: colors.warningSoft },
  blockedTitle: { color: colors.warning, fontSize: 16, fontWeight: '800' },
  helper: { flex: 1, color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  cameraPanel: { minHeight: 330, overflow: 'hidden', borderRadius: radius.card, backgroundColor: colors.camera },
  camera: { minHeight: 330, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 220, height: 220, borderWidth: 3, borderColor: '#FFFFFF', borderRadius: radius.card },
  cameraFallback: { minHeight: 330, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20, backgroundColor: colors.surface },
  tabContainer: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.input, padding: 4, marginBottom: 8 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.input - 2 },
  tabButtonActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 1 },
  tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: colors.text, fontWeight: '800' },
  manualPanel: { gap: 10 },
  input: {
    minHeight: 76,
    paddingHorizontal: 14,
    paddingTop: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  result: { padding: 18, gap: 5, borderRadius: radius.card, borderWidth: 1 },
  resultSuccess: { backgroundColor: colors.successSoft, borderColor: colors.success },
  resultWarning: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  resultDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  resultTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  resultMessage: { color: colors.text, fontSize: 14, lineHeight: 20 },
  resultMeta: { color: colors.textMuted, fontSize: 12 },
  counters: { flexDirection: 'row', gap: 10 },
  counter: { flex: 1, paddingVertical: 12, alignItems: 'center', borderTopWidth: 2, borderTopColor: colors.border },
  counterValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  counterLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
});
