import { Pressable, StyleSheet, Text, View } from 'react-native';

import { languages, useScannerLanguage, type Language } from '../i18n';
import { colors, radius } from './theme';

const options = Object.entries(languages) as [Language, (typeof languages)[Language]][];

export function LanguageSelect() {
  const { language, selectLanguage, t } = useScannerLanguage();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{t('language')}</Text>
      <View style={styles.options}>
        {options.map(([code, { name, locale }]) => {
          const selected = language === code;
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityLabel={name}
              accessibilityLanguage={locale}
              accessibilityState={{ selected }}
              onPress={() => selectLanguage(code)}
              style={[styles.button, selected && styles.selected]}
            >
              <Text style={[styles.label, selected && styles.selectedLabel]}>{name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: {
    flexGrow: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 10, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border,
  },
  selected: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  selectedLabel: { color: colors.accent },
});
