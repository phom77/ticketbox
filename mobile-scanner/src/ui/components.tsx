import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radius, spacing } from './theme';

type BottomNavScreen = 'overview' | 'scanner' | 'data' | 'guestlist';

export function Screen({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>{children}</View>
      {footer}
    </SafeAreaView>
  );
}

export function Header({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.buttonPressed,
        (disabled || loading) && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text numberOfLines={1} style={styles.primaryButtonText}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text numberOfLines={1} style={styles.secondaryButtonText}>
        {label}
      </Text>
    </Pressable>
  );
}

export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'success' && styles.badgeSuccess,
        tone === 'warning' && styles.badgeWarning,
        tone === 'danger' && styles.badgeDanger,
      ]}
    >
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function BottomNav({
  active,
  onChange,
  showGuestList = false,
}: {
  active: BottomNavScreen;
  onChange: (screen: BottomNavScreen) => void;
  showGuestList?: boolean;
}) {
  const items: ReadonlyArray<readonly [BottomNavScreen, string]> = [
    ['overview', 'Tổng quan'],
    ['scanner', 'Quét vé'],
    ['data', 'Dữ liệu'],
    ...(showGuestList ? ([['guestlist', 'Khách mời']] as const) : []),
  ] as const;

  return (
    <View style={styles.bottomNav}>
      {items.map(([key, label]) => {
        const isActive = active === key;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={key}
            onPress={() => onChange(key)}
            style={({ pressed }) => [styles.navItem, pressed && styles.buttonPressed]}
          >
            <Text style={[styles.navText, isActive && styles.navTextActive]}>{label}</Text>
            {isActive ? <View style={styles.navIndicator} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: { flex: 1, gap: 5 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  primaryButton: {
    minHeight: 50,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.accent,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryButton: {
    minHeight: 46,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  buttonPressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.48 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: colors.surfaceMuted,
  },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeWarning: { backgroundColor: colors.warningSoft },
  badgeDanger: { backgroundColor: colors.dangerSoft },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  emptyState: {
    margin: spacing.screen,
    padding: 24,
    gap: 8,
    alignItems: 'center',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyMessage: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  errorBanner: {
    padding: 12,
    borderRadius: radius.input,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  bottomNav: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  navItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 5 },
  navText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  navTextActive: { color: colors.accent, fontWeight: '900' },
  navIndicator: { width: 24, height: 3, borderRadius: 2, backgroundColor: colors.accent },
});
