import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  AccessibilityInfo, BackHandler, findNodeHandle, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Screen, SecondaryButton } from './components';
import { colors, radius, spacing } from './theme';

export type ConcertRoute = 'overview' | 'scanner' | 'history' | 'data' | 'guestlist';

const titles: Record<ConcertRoute, string> = {
  overview: 'Tổng quan', scanner: 'Quét vé', history: 'Lịch sử quét',
  data: 'Danh sách vé', guestlist: 'Khách mời',
};

type IconName = ComponentProps<typeof MaterialIcons>['name'];

type Props = {
  screen: ConcertRoute;
  eventTitle: string;
  gate: string;
  staffName: string;
  menuOpen: boolean;
  hasGuests: boolean;
  pending: number;
  syncing: boolean;
  syncError: string | null;
  onMenuChange: (open: boolean) => void;
  onNavigate: (screen: ConcertRoute) => void;
  onChangeEvent: () => void;
  onSync: () => void;
  onLogout: () => void;
  children: ReactNode;
};

export function ConcertShell(props: Props) {
  const menuButton = useRef<View>(null);
  const closeButton = useRef<View>(null);
  const heading = useRef<View>(null);
  const previousScreen = useRef(props.screen);
  const [reduceMotion, setReduceMotion] = useState(true);
  const handleBack = useRef(() => {});

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (props.screen === previousScreen.current) return;
    previousScreen.current = props.screen;
    const frame = requestAnimationFrame(() => focus(heading.current));
    return () => cancelAnimationFrame(frame);
  }, [props.screen]);

  useLayoutEffect(() => {
    handleBack.current = () => {
      if (props.screen === 'overview') props.onChangeEvent();
      else props.onNavigate('overview');
    };
  }, [props.screen, props.onNavigate, props.onChangeEvent]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack.current();
      return true;
    });
    return () => subscription.remove();
  }, []);

  function dismissMenu() {
    props.onMenuChange(false);
    requestAnimationFrame(() => focus(menuButton.current));
  }

  function openRoute(route: ConcertRoute) {
    if (route === props.screen) dismissMenu();
    else {
      props.onMenuChange(false);
      props.onNavigate(route);
    }
  }

  return (
    <Screen>
      <View
        style={styles.workspace}
        importantForAccessibility={props.menuOpen ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={props.menuOpen}
      >
        <View style={styles.header}>
          <Pressable
            ref={menuButton}
            accessibilityRole="button"
            accessibilityLabel="Mở menu"
            onPress={() => props.onMenuChange(true)}
            style={styles.iconButton}
          >
            <MaterialIcons name="menu" size={24} color={colors.text} />
          </Pressable>
          <View
            ref={heading}
            accessible
            accessibilityRole="header"
            accessibilityLabel={titles[props.screen]}
            tabIndex={-1}
            style={styles.heading}
          >
            <Text style={styles.title}>{titles[props.screen]}</Text>
          </View>
        </View>
        <View style={styles.workspace}>{props.children}</View>
        <View accessibilityRole="tablist" style={styles.tabs}>
          <NavTab
            icon="qr-code-scanner" label="Quét vé" selected={props.screen === 'scanner'}
            onPress={() => props.onNavigate('scanner')}
          />
          <NavTab
            icon="history" label="Lịch sử" selected={props.screen === 'history'}
            onPress={() => props.onNavigate('history')}
          />
        </View>
      </View>
      <Modal
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType={reduceMotion ? 'none' : 'fade'}
        visible={props.menuOpen}
        onShow={() => focus(closeButton.current)}
        onRequestClose={dismissMenu}
      >
        <View style={styles.modal}>
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            tabIndex={-1}
            style={StyleSheet.absoluteFill}
            onPress={dismissMenu}
          />
          <SafeAreaView accessibilityViewIsModal style={styles.drawer}>
            <ScrollView contentContainerStyle={styles.drawerContent}>
              <View style={styles.drawerHeader}>
                <Text accessibilityRole="header" style={[styles.title, styles.heading]}>TicketBox</Text>
                <Pressable
                  ref={closeButton}
                  accessibilityRole="button"
                  accessibilityLabel="Đóng menu"
                  onPress={dismissMenu}
                  style={styles.iconButton}
                >
                  <MaterialIcons name="close" size={22} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.context}>
                <Text style={styles.muted}>{props.staffName}</Text>
                <Text style={styles.event}>{props.eventTitle}</Text>
                <Text style={styles.muted}>{props.gate.trim() ? `Cổng ${props.gate.trim()}` : 'Chưa xác nhận cổng'}</Text>
              </View>
              <MenuItem icon="tune" label="Tổng quan và cổng" onPress={() => openRoute('overview')} />
              <MenuItem icon="confirmation-number" label="Danh sách vé" onPress={() => openRoute('data')} />
              {props.hasGuests ? (
                <MenuItem icon="people-outline" label="Khách mời" onPress={() => openRoute('guestlist')} />
              ) : null}
              <MenuItem icon="event" label="Đổi sự kiện" onPress={props.onChangeEvent} />
              <MenuItem icon="logout" label="Đăng xuất" onPress={props.onLogout} />
            </ScrollView>
            <View style={styles.drawerFooter}>
              <Text style={styles.event}>{props.pending} lượt chờ xác nhận</Text>
              {props.syncError ? <Text role="alert" style={styles.error}>{props.syncError}</Text> : null}
              <SecondaryButton
                label={props.syncing ? 'Đang đồng bộ…' : 'Đồng bộ dữ liệu'}
                disabled={props.syncing || props.pending === 0}
                onPress={props.onSync}
              />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </Screen>
  );
}

function focus(node: View | null) {
  if (!node) return;
  if (Platform.OS === 'web') node.focus();
  else {
    const handle = findNodeHandle(node);
    if (handle !== null) AccessibilityInfo.setAccessibilityFocus(handle);
  }
}

function NavTab({ icon, label, selected, onPress }: {
  icon: IconName; label: string; selected: boolean; onPress: () => void;
}) {
  const color = selected ? colors.accent : colors.textMuted;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.tab}
    >
      <View style={[styles.tabIcon, selected && styles.selected]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function MenuItem({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && styles.selected]}
    >
      <MaterialIcons name={icon} size={22} color={colors.textMuted} />
      <Text style={styles.menuLabel}>{label}</Text>
      <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.screen,
    paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  heading: { flex: 1 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  iconButton: {
    minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceMuted, borderRadius: radius.button,
  },
  tabs: {
    flexDirection: 'row', paddingHorizontal: spacing.screen, paddingVertical: 4,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabIcon: { paddingVertical: 3, paddingHorizontal: 14, borderRadius: 20 },
  selected: { backgroundColor: colors.accentSoft },
  tabLabel: { fontSize: 13, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.54)' },
  drawer: { flex: 1, width: '82%', maxWidth: 344, backgroundColor: colors.surface, elevation: 16 },
  drawerContent: { padding: spacing.screen, gap: 4 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  context: { gap: 4, padding: 12, borderRadius: radius.card, backgroundColor: colors.surfaceMuted, marginBottom: 8 },
  event: { color: colors.text, fontSize: 15, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8,
    paddingVertical: 8, minHeight: 52, borderRadius: radius.button,
  },
  menuLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  drawerFooter: { padding: spacing.screen, gap: 8, borderTopWidth: 1, borderTopColor: colors.border },
});
