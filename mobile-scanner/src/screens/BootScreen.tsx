import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScannerLanguage } from '../i18n';
import { colors } from '../ui/theme';

export function BootScreen() {
  const { t } = useScannerLanguage();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.centerPanel}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.mutedText}>{t('boot')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 15,
  },
});
