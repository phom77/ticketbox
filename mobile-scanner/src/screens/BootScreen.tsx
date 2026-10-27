import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui/theme';

export function BootScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.centerPanel}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.mutedText}>Đang chuẩn bị phiên làm việc...</Text>
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
