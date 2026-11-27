import type { InputHTMLAttributes } from 'react';
import { numberFormatter } from '../../data/formatters';

const grouping = numberFormatter({ maximumFractionDigits: 0 });

type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'inputMode' | 'max'
> & {
  value: number;
  onValueChange: (value: number) => void;
  max?: number;
  /** Shows 0 instead of an empty field, for prices that may legitimately be free. */
  allowZero?: boolean;
};

/** A whole-VND amount shown with locale thousands separators. Zero shows as empty unless `allowZero` is set. */
export function MoneyInput({
  value,
  onValueChange,
  max,
  allowZero,
  className,
  ...input
}: MoneyInputProps) {
  return (
    <span className={['money-input', className].filter(Boolean).join(' ')}>
      <input
        {...input}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value > 0 || allowZero ? grouping.format(value) : ''}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').replace(/^0+/, '');
          const next = digits ? Number(digits) : 0;
          if (!Number.isSafeInteger(next) || (max !== undefined && next > max)) return;
          onValueChange(next);
        }}
      />
      <span className="money-input-unit" aria-hidden="true">
        ₫
      </span>
    </span>
  );
}
