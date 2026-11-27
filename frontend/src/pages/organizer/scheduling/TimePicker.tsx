import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLanguage } from '../../../i18n';
import { formatTime, parseTime, timeSteps } from '../../../components/date/dateMath';

/** A time of day (HH:mm) typed in the locale format or chosen from 15-minute steps. */
export function TimePicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('scheduling');
  const locale = formatLanguage();
  const id = useId();
  const [text, setText] = useState(formatTime(value, locale));
  const [invalid, setInvalid] = useState(false);
  // Re-read the text only when the value changed from outside; a half-typed time stays as typed.
  useEffect(() => {
    if (parseTime(text) !== value) setText(formatTime(value, locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, locale]);
  return (
    <label>
      {label}
      <input
        list={`${id}-steps`}
        value={text}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        placeholder={locale.startsWith('vi') ? 'HH:mm' : 'h:mm AM'}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = parseTime(event.target.value);
          setInvalid(Boolean(event.target.value.trim()) && !parsed);
          onChange(parsed);
        }}
        onBlur={() => {
          const parsed = parseTime(text);
          if (parsed) setText(formatTime(parsed, locale));
        }}
      />
      <datalist id={`${id}-steps`}>
        {timeSteps.map((step) => (
          <option key={step} value={formatTime(step, locale)} />
        ))}
      </datalist>
      {invalid && <small className="performance-field-error">{t('scheduling:timeInvalid')}</small>}
    </label>
  );
}
