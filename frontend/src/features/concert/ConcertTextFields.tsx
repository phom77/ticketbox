import { useTranslation } from 'react-i18next';
import type { ConcertText, ConcertTranslations } from '../../api/concerts';
import { languages } from '../../i18n';
import { emptyConcertText } from './concertText';

export function ConcertTextFields({
  original,
  translations,
  onChange,
}: {
  original?: ConcertText | null;
  translations?: ConcertTranslations;
  onChange: (value: { original?: ConcertText | null; translations: ConcertTranslations }) => void;
}) {
  const { t } = useTranslation();

  function fields(label: string, text: ConcertText, update: (next: ConcertText) => void, lang?: string) {
    return (
      <fieldset className="admin-field admin-field-wide concert-text-fields" key={lang ?? 'original'}>
        <legend>{label}</legend>
        <label className="admin-field">
          <span>{t('concertTitle')}</span>
          <input lang={lang} maxLength={500} value={text.title ?? ''}
            onChange={(event) => update({ ...text, title: event.target.value })} />
        </label>
        <label className="admin-field">
          <span>{t('concertDescription')}</span>
          <textarea lang={lang} rows={3} value={text.description ?? ''}
            onChange={(event) => update({ ...text, description: event.target.value })} />
        </label>
      </fieldset>
    );
  }

  return (
    <div className="admin-field-wide concert-text-editor">
      <p>{t('concertLanguageHelp')}</p>
      {original && fields(t('concertOriginal'), original,
        (next) => onChange({ original: next, translations: translations ?? {} }))}
      {languages.map(({ code, name }) => fields(name, translations?.[code] ?? emptyConcertText,
        (next) => onChange({ original, translations: { ...translations, [code]: next } }), code))}
    </div>
  );
}
