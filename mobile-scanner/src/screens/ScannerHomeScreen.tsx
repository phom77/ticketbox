import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { requireOptionalNativeModule } from 'expo';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, AppState, BackHandler, findNodeHandle, Linking,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View,
} from 'react-native';

import { useScannerLanguage } from '../i18n';
import { SCAN_DUPLICATE_WINDOW_MS, type StaffConcert } from '../api';
import type { ManualCheckinResult } from '../features/checkin';
import type { HistoryEntry } from '../features/checkin/history';
import { ScanHistoryRow } from '../ui/ScanHistoryRow';
import { admissionStatus, localAdmissionStatus, scanStatus } from '../features/checkin/status';
import { PrimaryButton, SecondaryButton, StatusBadge } from '../ui/components';
import { colors, radius, spacing } from '../ui/theme';

const hardware = Platform.OS === 'android'
  ? requireOptionalNativeModule<{ hasTorch: () => boolean }>('ScannerHardware')
  : null;

type Props = {
  concert: StaffConcert;
  gate: string;
  qrCode: string;
  authority: 'unknown' | 'reachable' | 'unreachable';
  menuOpen: boolean;
  isCheckingIn: boolean;
  result: ManualCheckinResult | null;
  recent: HistoryEntry[];
  onOpenHistory: () => void;
  onChangeQrCode: (value: string) => void;
  onCheckin: () => void;
  onCameraQrScanned: (value: string) => void;
};

export function ScannerHomeScreen(props: Props) {
  const { t } = useScannerLanguage();
  const [permission, requestPermission, getPermission] = useCameraPermissions({ get: false });
  const [manual, setManual] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active' || AppState.currentState == null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [torch, setTorch] = useState(false);
  const [hasTorch] = useState(() => hardware?.hasTorch() ?? false);
  const lastRead = useRef<{ value: string; time: number } | null>(null);
  const { width, height, fontScale } = useWindowDimensions();
  const cameraHeight = Math.max(152, Math.min(width - 32, (height * 0.42) / Math.max(1, fontScale), 330));
  const showCamera = !manual && foreground && !props.menuOpen && !cameraError && permission?.granted;
  const canRead = Boolean(showCamera && cameraReady && !props.isCheckingIn && props.gate.trim());
  const processQr = useRef(props.onCameraQrScanned);
  const reading = useRef(canRead);
  const feedback = props.result ? scanStatus(props.result) : null;
  const manualButton = useRef<View>(null);
  const entry = useRef<TextInput>(null);

  useEffect(() => {
    void getPermission().catch(() => setCameraError(true));
    const change = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state === 'active') void getPermission().catch(() => setCameraError(true));
    });
    const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => setForeground(false)) : null;
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', () => setForeground(true)) : null;
    return () => {
      change.remove();
      blur?.remove();
      focus?.remove();
    };
  }, [getPermission]);

  useEffect(() => {
    if (showCamera) return;
    setCameraReady(false);
    setTorch(false);
  }, [showCamera]);

  useEffect(() => {
    if (!manual) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeManual();
      return true;
    });
    return () => subscription.remove();
  }, [manual]);

  function closeManual() {
    setManual(false);
    requestAnimationFrame(() => {
      const button = manualButton.current;
      if (!button) return;
      if (Platform.OS === 'web') button.focus();
      else {
        const handle = findNodeHandle(button);
        if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
      }
    });
  }

  useLayoutEffect(() => {
    processQr.current = props.onCameraQrScanned;
    reading.current = canRead;
    return () => { reading.current = false; };
  }, [canRead, props.onCameraQrScanned]);

  // Expo Camera's web scanner can keep the callback from its first render.
  const onBarcodeScanned = useCallback((scan: BarcodeScanningResult) => {
    if (!reading.current) return;
    if (AppState.currentState && AppState.currentState !== 'active') return;
    const value = scan.data.trim();
    const time = Date.now();
    const repeated = lastRead.current?.value === value && time - lastRead.current.time < SCAN_DUPLICATE_WINDOW_MS;
    if (!value || repeated) return;
    lastRead.current = { value, time };
    processQr.current(value);
  }, []);

  async function recoverCamera() {
    try {
      if (cameraError) {
        await getPermission();
        setCameraError(false);
      }
      else if (permission?.canAskAgain) await requestPermission();
      else if (Platform.OS !== 'web') await Linking.openSettings();
    } catch {
      setCameraError(true);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={styles.event}>
        <View style={styles.eventCopy}>
          <Text style={styles.eventTitle}>{props.concert.title}</Text>
          <Text style={styles.muted}>{t('gate', { value: props.gate.trim() })}</Text>
        </View>
        <StatusBadge
          label={props.authority === 'reachable' ? t('connectedAuthority')
            : props.authority === 'unreachable' ? t('unreachableAuthority') : t('unknownAuthority')}
          tone={props.authority === 'unreachable' ? 'warning' : 'neutral'}
        />
      </View>

      {manual ? (
        <View style={styles.manual}>
          <Text style={styles.label}>{t('ticketCode')}</Text>
          <TextInput
            ref={entry}
            accessibilityLabel={t('ticketCode')}
            value={props.qrCode}
            onChangeText={props.onChangeQrCode}
            onSubmitEditing={() => {
              if (props.qrCode.trim() && !props.isCheckingIn) props.onCheckin();
            }}
            placeholder={t('enterCode')}
            placeholderTextColor={colors.textMuted}
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!props.isCheckingIn}
            style={styles.input}
          />
          <PrimaryButton
            label={t('checkTicket')} loading={props.isCheckingIn} disabled={!props.qrCode.trim()}
            onPress={props.onCheckin}
          />
        </View>
      ) : (
        <View style={styles.cameraPanel}>
          {showCamera ? (
            <View style={[styles.preview, { height: cameraHeight }]}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={torch}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onCameraReady={() => setCameraReady(true)}
                onMountError={() => setCameraError(true)}
                onBarcodeScanned={cameraReady ? onBarcodeScanned : undefined}
                accessible={false}
              />
              <View pointerEvents="none" style={styles.frame} />
              {cameraReady && hasTorch ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={torch ? t('torchOff') : t('torchOn')}
                  accessibilityState={{ selected: torch }}
                  onPress={() => setTorch((enabled) => !enabled)}
                  style={styles.torch}
                >
                  <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={24} color={colors.surface} />
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.fallback}>
              <MaterialIcons name="videocam-off" size={30} color={colors.surface} />
              <Text style={styles.cameraLabel}>
                {cameraError ? t('cameraError') : !permission ? t('cameraChecking')
                  : permission.granted ? t('cameraPaused') : t('cameraRequired')}
              </Text>
              {cameraError || (permission && !permission.granted && (permission.canAskAgain || Platform.OS !== 'web')) ? (
                <SecondaryButton label={cameraError ? t('cameraRetry')
                  : permission?.canAskAgain ? t('cameraAllow') : t('cameraSettings')} onPress={recoverCamera} />
              ) : null}
            </View>
          )}
          {showCamera ? (
            <Text style={styles.cameraHint}>{cameraReady ? t('cameraAim') : t('cameraOpening')}</Text>
          ) : null}
        </View>
      )}

      {props.isCheckingIn ? (
        <View aria-live="polite" accessibilityLiveRegion="polite" style={styles.processing}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.label}>{t('checkingTicket')}</Text>
        </View>
      ) : feedback && props.result ? (
        <View
          aria-live="polite"
          accessibilityLiveRegion="polite"
          style={[styles.result, { backgroundColor: resultColors[feedback.tone].surface }]}
        >
          <MaterialIcons name={feedback.icon} size={24} color={resultColors[feedback.tone].text} />
          <View style={styles.eventCopy}>
            <Text style={[styles.resultTitle, { color: resultColors[feedback.tone].text }]}>{t(feedback.label)}</Text>
            <Text style={styles.label}>{t(props.result.message, props.result.previousStatus ? {
              status: t(admissionStatus[localAdmissionStatus[props.result.previousStatus]].label),
            } : undefined)}</Text>
          </View>
        </View>
      ) : null}

      <Pressable
        ref={manualButton}
        accessibilityRole="button"
        onPress={() => {
          if (manual) closeManual();
          else {
            setManual(true);
            requestAnimationFrame(() => entry.current?.focus());
          }
        }}
        style={styles.manualButton}
      >
        <MaterialIcons name={manual ? 'qr-code-scanner' : 'keyboard'} size={22} color={colors.text} />
        <Text style={styles.label}>{manual ? t('backCamera') : t('manualEntry')}</Text>
      </Pressable>
      <View style={styles.recent}>
        <View style={styles.recentHeader}>
          <Text accessibilityRole="header" style={styles.eventTitle}>{t('recentScans')}</Text>
          <Pressable accessibilityRole="button" onPress={props.onOpenHistory} style={styles.historyButton}>
            <Text style={styles.historyLink}>{t('seeAll')}</Text>
          </Pressable>
        </View>
        {props.recent.length
          ? props.recent.map((item) => <ScanHistoryRow key={item.id} item={item} compact />)
          : <Text style={styles.muted}>{t('noScans')}</Text>}
      </View>
    </ScrollView>
  );
}

const resultColors = {
  success: { surface: colors.successSoft, text: colors.success },
  warning: { surface: colors.warningSoft, text: colors.warning },
  danger: { surface: colors.dangerSoft, text: colors.danger },
};

const styles = StyleSheet.create({
  content: { padding: spacing.screen, gap: 12 },
  event: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, padding: 12,
    borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted,
  },
  eventCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 136, gap: 4 },
  eventTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 13 },
  cameraPanel: { borderRadius: radius.camera, overflow: 'hidden', backgroundColor: colors.camera },
  preview: { alignItems: 'center', justifyContent: 'center' },
  frame: { height: '66%', aspectRatio: 1, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 16 },
  torch: {
    position: 'absolute', right: 12, top: 12, width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  fallback: { minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 },
  cameraLabel: { color: colors.surface, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  cameraHint: { color: colors.surface, fontSize: 14, textAlign: 'center', padding: 12 },
  manual: { gap: 8 },
  manualButton: {
    minHeight: 48, borderColor: colors.border, borderWidth: 1, borderRadius: radius.button,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8,
  },
  label: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  input: {
    minHeight: 48, paddingHorizontal: 12, color: colors.text, fontSize: 16,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.input,
  },
  result: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.card, alignItems: 'flex-start' },
  resultTitle: { fontSize: 18, fontWeight: '700' },
  recent: { paddingHorizontal: 12, paddingBottom: 12, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.card },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' },
  historyButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 },
  historyLink: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  processing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
});
