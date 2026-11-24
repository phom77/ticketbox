import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { useId } from 'react';
import { formatLanguage } from '../../i18n';
import { getPerformanceTimeZones } from './performanceDateTime';

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

type DateTimeProps = FieldProps & {
  name: string;
  required?: boolean;
  min?: string;
  max?: string;
  error?: string;
  description?: string;
};

export function PerformanceDateTimeField({
  name,
  label,
  value,
  onChange,
  required,
  min,
  max,
  disabled,
  error,
  description,
}: DateTimeProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const feedbackId = error || description ? `${id}-feedback` : undefined;

  return (
    <label htmlFor={id}>
      <span id={labelId}>{label}</span>
      <input
        id={id}
        name={name}
        type="datetime-local"
        lang={formatLanguage()}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        step={value.length > 16 ? 'any' : undefined}
        aria-labelledby={labelId}
        aria-invalid={error ? true : undefined}
        aria-describedby={feedbackId}
      />
      {error ? (
        <small id={feedbackId} className="performance-field-error">
          {error}
        </small>
      ) : (
        description && (
          <small id={feedbackId} className="performance-field-help">
            {description}
          </small>
        )
      )}
    </label>
  );
}

const timeZones = getPerformanceTimeZones();

export function PerformanceTimeZoneField({
  label,
  name = 'timezone',
  value,
  onChange,
  disabled,
}: FieldProps & { name?: string }) {
  return (
    <label>
      <span>{label}</span>
      <WorkspaceSelect
        label={label}
        name={name}
        value={value}
        disabled={disabled}
        onChange={onChange}
        required
        options={(value && !timeZones.includes(value) ? [value, ...timeZones] : timeZones).map(
          (zone) => ({ value: zone, label: zone.replace(/_/g, ' ') }),
        )}
      />
    </label>
  );
}
