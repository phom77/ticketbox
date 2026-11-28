import { WorkspaceSelect } from '../../components/WorkspaceSelect';
import { DateTimePicker } from '../../components/date/DateTimePicker';
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
  /** The performance time zone; it is labelled next to the value and used to check clock changes. */
  timeZone?: string;
  /** Shows a calendar-only control; the value is still read as an ISO date prefix. */
  dateOnly?: boolean;
};

/** Workspace date and time entry: the accessible calendar and time picker, in the performance time zone. */
export function PerformanceDateTimeField({ dateOnly, value, ...props }: DateTimeProps) {
  return (
    <DateTimePicker
      {...props}
      dateOnly={dateOnly}
      value={dateOnly && value ? value.slice(0, 10) + 'T00:00' : value}
      onChange={(next) => props.onChange(dateOnly ? next.slice(0, 10) : next)}
    />
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
