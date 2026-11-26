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
};

/** A whole-VND amount shown with locale thousands separators. Zero shows as empty. */
export function MoneyInput({ value, onValueChange, max, className, ...input }: MoneyInputProps) {
  return (
    <span className={['money-input', className].filter(Boolean).join(' ')}>
      <input
        {...input}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value > 0 ? grouping.format(value) : ''}
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
