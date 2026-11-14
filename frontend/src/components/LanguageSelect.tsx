import { useTranslation } from 'react-i18next';
import { currentLanguage, languages, selectLanguage, type Language } from '../i18n';

export function LanguageSelect() {
  const { t } = useTranslation();
  return (
    <select
      className="language-select"
      data-language-select
      aria-label={t('language')}
      value={currentLanguage()}
      onChange={(event) => void selectLanguage(event.currentTarget.value as Language)}
    >
      {languages.map(({ code, name }) => (
        <option key={code} value={code} lang={code}>{name}</option>
      ))}
    </select>
  );
}
