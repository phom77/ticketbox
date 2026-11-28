import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import { formatLanguage } from '../../i18n';
import {
  formatTime,
  formatTypedDate,
  parseIsoDate,
  parseTime,
  parseTypedDate,
  timeSteps,
  typedDateOrder,
} from './dateMath';
import { CalendarGrid } from './CalendarGrid';
import { useOutsidePress } from './useDismissable';
import { resolvePerformanceDateTime } from '../../pages/organizer/performanceDateTime';
import './date-picker.css';

export type DateTimePickerProps = {
  label: string;
  name: string;
  /** Wall time in the time zone as YYYY-MM-DDTHH:mm, or empty. */
  value: string;
  onChange: (value: string) => void;
  /** The IANA zone the wall time is read in; it is labelled next to the field. */
  timeZone?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  error?: string;
  description?: string;
  /** Shows the calendar only; the value is still a wall time with 00:00. */
  dateOnly?: boolean;
};

function zoneLabel(timeZone: string, locale: string, date: string) {
  try {
    // The offset at the selected date (noon avoids edge cases at midnight); today when none is chosen.
    const at = date && parseIsoDate(date) ? new Date(`${date}T12:00:00Z`) : new Date();
    const offset = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;
    return `${timeZone.replace(/_/g, ' ')}${offset ? ` (${offset.replace('GMT', 'GMT ').trim()})` : ''}`;
  } catch {
    return timeZone;
  }
}

export function DateTimePicker({
  label,
  name,
  value,
  onChange,
  timeZone,
  required,
  disabled,
  min,
  max,
  error,
  description,
  dateOnly,
}: DateTimePickerProps) {
  const { t } = useTranslation('scheduling');
  const locale = formatLanguage();
  const id = useId();
  const [date, setDate] = useState(value.slice(0, 10));
  const [time, setTime] = useState(value.slice(11, 16));
  const [dateText, setDateText] = useState(formatTypedDate(value.slice(0, 10), locale));
  const [timeText, setTimeText] = useState(formatTime(value.slice(11, 16), locale));
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState(false);
  const [timeError, setTimeError] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [active, setActive] = useState(-1);
  const toggle = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const timeBox = useRef<HTMLDivElement>(null);
  const composed = (nextDate: string, nextTime: string) =>
    nextDate && (dateOnly || nextTime) ? `${nextDate}T${dateOnly ? '00:00' : nextTime}` : '';

  useEffect(() => {
    // Re-read the fields when the parent changes the value, but keep a half-typed date or time.
    if (value === composed(date, time)) return;
    setDate(value.slice(0, 10));
    setTime(value.slice(11, 16));
    setDateText(formatTypedDate(value.slice(0, 10), locale));
    setTimeText(formatTime(value.slice(11, 16), locale));
    setTimeError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const closePopover = () => setOpen(false);
  function closeAndRestore() {
    setOpen(false);
    toggle.current?.focus();
  }
  const outsideRange = (day: string) =>
    Boolean((min && day < min.slice(0, 10)) || (max && day > max.slice(0, 10)));

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAndRestore();
      return;
    }
    if (event.key !== 'Tab' || !popover.current) return;
    const items = Array.from(
      popover.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled])',
      ),
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !popover.current.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !popover.current.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  }
  useOutsidePress(open, [popover, toggle], closePopover);
  useOutsidePress(listing, [timeBox], () => setListing(false));

  function commit(nextDate: string, nextTime: string) {
    setDate(nextDate);
    setTime(nextTime);
    const next = composed(nextDate, nextTime);
    if (next !== value && (next || value)) onChange(next);
  }

  function commitTime(text: string) {
    setTimeText(text);
    if (!text.trim()) {
      setTimeError('');
      commit(date, '');
      return;
    }
    const parsed = parseTime(text);
    setTimeError(parsed ? '' : t('scheduling:timeInvalid'));
    if (parsed) commit(date, parsed);
  }

  const dateError = dateText.trim() && !parseTypedDate(dateText, locale);
  // A date-only value is midnight; judge the clock change at noon so a skipped midnight is not an error.
  const clock = resolvePerformanceDateTime(
    dateOnly && date ? `${date}T12:00` : value,
    timeZone ?? 'UTC',
  );
  const zoneProblem = timeZone && !clock.ok && clock.reason !== 'invalid' ? clock.reason : '';
  const message =
    error ||
    (dateError
      ? t('scheduling:dateInvalid', {
          format: typedDateOrder(locale) === 'dmy' ? 'dd/MM/yyyy' : 'MM/dd/yyyy',
        })
      : '') ||
    rangeError ||
    timeError ||
    (zoneProblem ? t(`zone_${zoneProblem}`) : '');
  const feedbackId = message || description ? `${id}-feedback` : undefined;
  const zoneId = timeZone ? `${id}-zone` : undefined;

  function chooseStep(step: string) {
    setTimeText(formatTime(step, locale));
    setTimeError('');
    commit(date, step);
    setListing(false);
    setActive(-1);
  }

  function onTimeKey(event: KeyboardEvent<HTMLInputElement>) {
    const last = timeSteps.length - 1;
    const select = (index: number) => {
      setActive(index);
      document.getElementById(`${id}-time-${index}`)?.scrollIntoView?.({ block: 'nearest' });
    };
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!listing) {
        setListing(true);
        setActive(Math.max(timeSteps.indexOf(time), 0));
        return;
      }
      const start =
        active < 0
          ? Math.max(timeSteps.indexOf(time), 0) - (event.key === 'ArrowDown' ? 1 : -1)
          : active;
      select(Math.min(last, Math.max(0, start + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (listing && (event.key === 'Home' || event.key === 'End') && active >= 0) {
      event.preventDefault();
      select(event.key === 'Home' ? 0 : last);
    } else if (event.key === 'Enter' && listing && active >= 0) {
      event.preventDefault();
      chooseStep(timeSteps[active]);
    } else if (event.key === 'Escape' && listing) {
      event.preventDefault();
      event.stopPropagation();
      setListing(false);
      setActive(-1);
    }
  }

  return (
    <div className="date-time-picker" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="date-time-label">
        {label}
      </span>
      <div className="date-time-controls">
        <div className="date-time-date">
          <input
            id={`${id}-date`}
            name={name}
            inputMode="numeric"
            autoComplete="off"
            value={dateText}
            placeholder={typedDateOrder(locale) === 'dmy' ? 'dd/MM/yyyy' : 'MM/dd/yyyy'}
            disabled={disabled}
            required={required}
            aria-label={t('scheduling:dateField', { label })}
            aria-invalid={message ? true : undefined}
            aria-describedby={[feedbackId, zoneId].filter(Boolean).join(' ') || undefined}
            onChange={(event) => {
              setDateText(event.target.value);
              const parsed = parseTypedDate(event.target.value, locale);
              if (parsed && outsideRange(parsed)) {
                setRangeError(t('scheduling:dateOutOfRange'));
              } else if (parsed) {
                setRangeError('');
                commit(parsed, time);
              } else {
                setRangeError('');
                if (!event.target.value.trim()) commit('', time);
              }
            }}
            onBlur={() => {
              if (date) setDateText(formatTypedDate(date, locale));
            }}
          />
          <button
            type="button"
            ref={toggle}
            className="date-time-open"
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={t('scheduling:chooseDate', { label })}
            onClick={() => setOpen((current) => !current)}
          >
            <CalendarDays size={18} aria-hidden="true" />
          </button>
        </div>
        {!dateOnly && (
          <div className="date-time-time" ref={timeBox}>
            <input
              id={`${id}-time`}
              role="combobox"
              aria-expanded={listing}
              aria-controls={`${id}-times`}
              aria-autocomplete="list"
              autoComplete="off"
              inputMode="numeric"
              value={timeText}
              disabled={disabled}
              required={required}
              placeholder={locale.startsWith('vi') ? 'HH:mm' : 'h:mm AM'}
              aria-label={t('scheduling:timeField', { label })}
              aria-invalid={message ? true : undefined}
              aria-describedby={[feedbackId, zoneId].filter(Boolean).join(' ') || undefined}
              aria-activedescendant={listing && active >= 0 ? `${id}-time-${active}` : undefined}
              onChange={(event) => {
                setActive(-1);
                commitTime(event.target.value);
              }}
              onKeyDown={onTimeKey}
              onFocus={() => setListing(true)}
            />
            {listing && (
              <ul
                id={`${id}-times`}
                role="listbox"
                aria-label={t('scheduling:timeList', { label })}
                className="date-time-times"
              >
                {timeSteps.map((step, index) => (
                  <li
                    key={step}
                    id={`${id}-time-${index}`}
                    role="option"
                    aria-selected={step === time}
                    data-active={index === active || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseStep(step)}
                  >
                    {formatTime(step, locale)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {timeZone && (
          <span id={zoneId} className="date-time-zone">
            {zoneLabel(timeZone, locale, date)}
          </span>
        )}
      </div>
      {open && (
        <div
          ref={popover}
          className="date-time-popover"
          role="dialog"
          aria-label={t('scheduling:calendarFor', { label })}
          aria-modal="false"
          onKeyDown={trapFocus}
        >
          <CalendarGrid
            selected={parseIsoDate(date) ? [date] : []}
            initialDate={parseIsoDate(date) ? date : min?.slice(0, 10)}
            min={min?.slice(0, 10)}
            max={max?.slice(0, 10)}
            locale={locale}
            autoFocus
            onEscape={closeAndRestore}
            onSelect={(day) => {
              setDateText(formatTypedDate(day, locale));
              commit(day, time);
              setOpen(false);
              toggle.current?.focus();
            }}
          />
        </div>
      )}
      {message ? (
        <small id={feedbackId} className="performance-field-error">
          {message}
        </small>
      ) : (
        description && (
          <small id={feedbackId} className="performance-field-help">
            {description}
          </small>
        )
      )}
    </div>
  );
}
