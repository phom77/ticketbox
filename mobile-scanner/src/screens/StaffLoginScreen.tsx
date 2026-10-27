import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius } from '../ui/theme';

type StaffLoginScreenProps = {
  email: string;
  password: string;
  errorMessage: string | null;
  isSubmitting: boolean;
  onChangeEmail: (email: string) => void;
  onChangePassword: (password: string) => void;
  onSubmit: () => void;
};

export function StaffLoginScreen({
  email,
  password,
  errorMessage,
  isSubmitting,
  onChangeEmail,
  onChangePassword,
  onSubmit,
}: StaffLoginScreenProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.kicker}>TicketBox Scanner</Text>
            <Text style={styles.title}>Đăng nhập nhân viên</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                editable={!isSubmitting}
                inputMode="email"
                keyboardType="email-address"
                onChangeText={onChangeEmail}
                placeholder="staff@example.com"
                placeholderTextColor="#7a8991"
                style={styles.input}
                value={email}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Mật khẩu</Text>
              <TextInput
                autoCapitalize="none"
                editable={!isSubmitting}
                onChangeText={onChangePassword}
                placeholder="Mật khẩu"
                placeholderTextColor="#7a8991"
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              disabled={isSubmitting}
              onPress={onSubmit}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || isSubmitting) && styles.primaryButtonPressed,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Đăng nhập</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 24,
    padding: 20,
  },
  header: {
    gap: 8,
  },
  kicker: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
  },
  form: {
    gap: 16,
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  field: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    minHeight: 50,
    borderRadius: radius.input,
    borderColor: colors.border,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: radius.button,
    backgroundColor: colors.accent,
  },
  primaryButtonPressed: {
    opacity: 0.78,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
