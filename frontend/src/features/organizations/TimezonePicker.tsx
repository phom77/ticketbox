import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { filterTimezones, timezoneOptions } from './timezones';

/** A searchable list of IANA timezones, each with its current UTC offset. */
export function TimezonePicker({
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { t } = useTranslation();
  const [term, setTerm] = useState('');
  const options = useMemo(() => timezoneOptions(value), [value]);
  const visible = filterTimezones(options, term, value);
  return (
    <div className="timezone-picker">
      <label className="workspace-records-search">
        <Search size={16} aria-hidden />
        <span className="event-visually-hidden">{t('organization-settings:timezoneSearch')}</span>
        <input
          type="search"
          value={term}
          disabled={disabled}
          placeholder={t('organization-settings:timezoneSearch')}
          onChange={(event) => setTerm(event.target.value)}
        />
      </label>
      <WorkspaceSelect
        label={t('organization-settings:timezone')}
        value={value}
        options={visible}
        onChange={onChange}
        disabled={disabled}
        invalid={invalid}
        describedBy={describedBy}
      />
      {term && visible.length === 1 && (
        <p className="workspace-records-field-note" role="status">
          {t('organization-settings:timezoneNoMatch')}
        </p>
      )}
    </div>
  );
}
