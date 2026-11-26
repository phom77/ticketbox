import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageUp, Trash2 } from 'lucide-react';
import { posterProblem } from '../../features/event/eventContent';
import './EventDetailsStep.css';

/**
 * The poster with the two shapes buyers see it in: a 3:4 card and a 16:9 banner, cropped from the same
 * image. A new file is checked here first so the organizer learns about a bad file before uploading.
 */
export function EventPosterField({
  url,
  busy,
  onChoose,
  onRemove,
  hint,
}: {
  url: string | null;
  busy: boolean;
  onChoose: (file: File) => void;
  onRemove?: () => void;
  hint?: string;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [problem, setProblem] = useState('');

  function choose(file: File | undefined) {
    if (!file) return;
    const issue = posterProblem(file);
    if (issue) {
      setProblem(
        issue === 'type' ? t('event-content:posterBadType') : t('event-content:posterTooLarge'),
      );
      return;
    }
    setProblem('');
    onChoose(file);
  }

  return (
    <fieldset className="event-poster performance-wide" disabled={busy}>
      <legend>{t('event-content:posterTitle')}</legend>
      <p className="performance-flow-help">{t('event-content:posterHelp')}</p>
      <div className="event-poster-previews">
        <figure>
          <div className="event-poster-frame event-poster-card" data-empty={!url || undefined}>
            {url ? <img src={url} alt="" /> : <ImageUp size={26} aria-hidden="true" />}
          </div>
          <figcaption>{t('event-content:posterCard')}</figcaption>
        </figure>
        <figure>
          <div className="event-poster-frame event-poster-banner" data-empty={!url || undefined}>
            {url ? <img src={url} alt="" /> : <ImageUp size={26} aria-hidden="true" />}
          </div>
          <figcaption>{t('event-content:posterBanner')}</figcaption>
        </figure>
      </div>
      <div className="event-poster-actions">
        <label className="button button-secondary" htmlFor={inputId}>
          <ImageUp size={17} aria-hidden="true" />
          {t(url ? 'event-content:posterReplace' : 'event-content:posterChoose')}
        </label>
        <input
          id={inputId}
          className="event-visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {url && onRemove && (
          <button type="button" className="button button-secondary" onClick={onRemove}>
            <Trash2 size={17} aria-hidden="true" />
            {t('event-content:posterRemove')}
          </button>
        )}
      </div>
      {hint && <p className="performance-flow-help">{hint}</p>}
      {problem && (
        <p className="performance-flow-error" role="alert">
          {problem}
        </p>
      )}
    </fieldset>
  );
}
