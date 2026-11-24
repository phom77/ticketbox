import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LanguageSelect } from '../../components/LanguageSelect';
import { useThemePreference, selectTheme } from '../../hooks/useThemePreference';

export function AccountSecurity() {
  const { t } = useTranslation();
  const headingId = useId();
  return (
    <section className="buyer-account-panel" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('customer:account_security')}</h2>
      <p>{t('customer:account_securityBody')}</p>
      <Link className="button button-secondary" to="/forgot-password">
        {t('customer:account_changePassword')}
      </Link>
    </section>
  );
}

export function AccountPreferences() {
  const { t } = useTranslation();
  const { theme } = useThemePreference();
  const headingId = useId();
  const languageId = useId();
  const themeLabelId = useId();
  return (
    <section className="buyer-account-panel" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('customer:account_preferences')}</h2>
      <div className="buyer-account-form">
        <label>
          <span id={languageId}>{t('customer:account_language')}</span>
          <LanguageSelect />
        </label>
        <div role="group" aria-labelledby={themeLabelId}>
          <span id={themeLabelId} className="buyer-account-field-label">
            {t('customer:account_theme')}
          </span>
          <div className="buyer-filters">
            {(['light', 'dark'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={theme === value}
                onClick={() => selectTheme(value)}
              >
                {t(
                  value === 'light' ? 'customer:account_themeLight' : 'customer:account_themeDark',
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="buyer-account-note">{t('customer:account_emailNote')}</p>
    </section>
  );
}
