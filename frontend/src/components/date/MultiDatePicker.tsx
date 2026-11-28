import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { formatLanguage } from '../../i18n';
import { CalendarGrid } from './CalendarGrid';
import { formatDay } from './dateMath';
import './date-picker.css';

/** Picks a set of days from one always-visible calendar; chosen days are listed and can be removed. */
export function MultiDatePicker({
  label,
  value,
  onChange,
  min,
  max,
  limit,
  disabled,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  min?: string;
  max?: string;
  limit?: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation('scheduling');
  const locale = formatLanguage();
  const id = useId();
  const sorted = [...value].sort();
  function toggle(day: string) {
    if (disabled) return;
    if (value.includes(day)) onChange(value.filter((entry) => entry !== day));
    else if (!limit || value.length < limit) onChange([...value, day]);
  }
  return (
    <div className="multi-date-picker" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="date-time-label">
        {label}
      </span>
      <CalendarGrid
        selected={value}
        onSelect={toggle}
        min={min}
        max={max}
        locale={locale}
        label={label}
      />
      <p role="status" className="performance-field-help">
        {t('scheduling:daysChosen', { count: value.length })}
        {limit && value.length >= limit ? ` ${t('scheduling:daysLimit', { count: limit })}` : ''}
      </p>
      {sorted.length > 0 && (
        <ul className="multi-date-chips">
          {sorted.map((day) => (
            <li key={day}>
              {formatDay(day, locale, { dateStyle: 'medium' })}
              <button
                type="button"
                disabled={disabled}
                aria-label={t('scheduling:removeDay', {
                  day: formatDay(day, locale, { dateStyle: 'medium' }),
                })}
                onClick={() => toggle(day)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
