import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  classificationText,
  matchGenres,
  segmentGenres,
  segmentOfGenre,
} from '../features/discovery/classification';
import { useClassifications } from '../features/discovery/useClassifications';
import { maxGenreTags } from '../features/event/eventContent';
import './ClassificationPicker.css';

export type ClassificationChoice = { segment: string; primaryGenre: string; genres: string[] };

type Option = { id: string; label: string };

/** A combobox with a filter field over a finite list: the ARIA 1.2 list-autocomplete pattern. */
function GenreCombobox({
  label,
  value,
  options,
  disabled,
  placeholder,
  emptyText,
  keepQuery,
  onPick,
  describedBy,
}: {
  label: string;
  /** The id shown while the list is closed; null for a combobox that only adds. */
  value: string | null;
  options: Option[];
  disabled?: boolean;
  placeholder: string;
  emptyText: string;
  keepQuery?: boolean;
  onPick: (id: string) => void;
  describedBy?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.id === value)?.label ?? '';
  const matches = options.filter(
    (option) =>
      matchGenres([{ id: option.id, popular: false }], query, () => option.label).length > 0,
  );
  const current = Math.min(active, Math.max(matches.length - 1, 0));
  const optionId = (index: number) => `${id}-option-${index}`;

  function close() {
    setOpen(false);
    setQuery('');
  }

  function pick(option: Option) {
    onPick(option.id);
    setQuery('');
    if (keepQuery) {
      setActive(0);
      input.current?.focus();
    } else close();
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((matches.length + current + step) % Math.max(matches.length, 1));
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      setActive(Math.max(matches.length - 1, 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (matches[current]) pick(matches[current]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  return (
    <div className="classification-combobox">
      <input
        ref={input}
        role="combobox"
        type="text"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-describedby={describedBy}
        aria-activedescendant={open && matches.length > 0 ? optionId(current) : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : selected}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={keyDown}
      />
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        className="classification-listbox"
        hidden={!open}
      >
        {matches.map((option, index) => (
          <li
            key={option.id}
            id={optionId(index)}
            role="option"
            aria-selected={option.id === value}
            data-active={index === current ? 'true' : undefined}
            // Keep focus in the field so the list does not close before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(option)}
          >
            {option.label}
          </li>
        ))}
        {matches.length === 0 ? <li className="classification-empty">{emptyText}</li> : null}
      </ul>
    </div>
  );
}

/**
 * Segment, primary genre and up to three additional genres of an event. The segment is a radio group; the primary genre
 * searches the genres of that segment; tags search every genre.
 */
export function ClassificationPicker({
  value,
  onChange,
  disabled,
}: {
  value: ClassificationChoice;
  onChange: (next: ClassificationChoice) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const segments = useClassifications();
  const name = useId();
  const hintId = useId();
  const limitId = useId();
  const text = (id: string, kind: 'segment' | 'genre') => classificationText(id, kind, t);
  const segment = segments.find((entry) => entry.id === value.segment);
  // A genre the event already has stays selectable in the list even after it was retired.
  const primaryOptions: Option[] = (segment ? segmentGenres(segment) : []).map((genre) => ({
    id: genre.id,
    label: text(genre.id, 'genre'),
  }));
  const allGenres = segments.flatMap((entry) => segmentGenres(entry));
  const tagOptions: Option[] = allGenres
    .filter((genre) => genre.id !== value.primaryGenre && !value.genres.includes(genre.id))
    .map((genre) => ({ id: genre.id, label: text(genre.id, 'genre') }));
  const full = value.genres.length >= maxGenreTags;

  function chooseSegment(next: string) {
    // The primary genre must belong to the segment: a genre outside the new one is cleared.
    const keep = value.primaryGenre && segmentOfGenre(value.primaryGenre) === next;
    onChange({ ...value, segment: next, primaryGenre: keep ? value.primaryGenre : '' });
  }

  function choosePrimary(genre: string) {
    onChange({
      ...value,
      primaryGenre: genre,
      genres: value.genres.filter((tag) => tag !== genre),
    });
  }

  return (
    <div className="classification-picker">
      <fieldset className="classification-segment" disabled={disabled}>
        <legend>{t('performances:classificationSegment')}</legend>
        <div className="classification-segment-options">
          {segments.map((entry) => (
            <label key={entry.id} data-checked={value.segment === entry.id ? 'true' : undefined}>
              <input
                type="radio"
                name={name}
                value={entry.id}
                checked={value.segment === entry.id}
                onChange={() => chooseSegment(entry.id)}
              />
              <span>{text(entry.id, 'segment')}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="classification-field">
        <span className="classification-label">{t('performances:classificationPrimary')}</span>
        <GenreCombobox
          label={t('performances:classificationPrimary')}
          value={value.primaryGenre || null}
          options={primaryOptions}
          disabled={disabled || !segment}
          placeholder={t(
            segment
              ? 'performances:classificationSearch'
              : 'performances:classificationPickSegment',
          )}
          emptyText={t('performances:classificationNoMatch')}
          onPick={choosePrimary}
          describedBy={hintId}
        />
        <small id={hintId}>{t('performances:classificationHint')}</small>
      </div>
      <div className="classification-field">
        <span className="classification-label">{t('performances:classificationTags')}</span>
        {value.genres.length > 0 ? (
          <ul
            className="classification-chips"
            aria-label={t('performances:classificationTagsChosen')}
          >
            {value.genres.map((genre) => (
              <li key={genre}>
                {text(genre, 'genre')}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t('performances:classificationRemove', {
                    genre: text(genre, 'genre'),
                  })}
                  onClick={() =>
                    onChange({ ...value, genres: value.genres.filter((tag) => tag !== genre) })
                  }
                >
                  <X aria-hidden="true" size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <GenreCombobox
          label={t('performances:classificationTags')}
          value={null}
          options={tagOptions}
          disabled={disabled || full}
          placeholder={t('performances:classificationSearch')}
          emptyText={t('performances:classificationNoMatch')}
          keepQuery
          onPick={(genre) => onChange({ ...value, genres: [...value.genres, genre] })}
          describedBy={limitId}
        />
        <small id={limitId} role="status">
          {t(
            full ? 'performances:classificationLimitReached' : 'performances:classificationLimit',
            {
              count: value.genres.length,
              max: maxGenreTags,
            },
          )}
        </small>
      </div>
    </div>
  );
}
