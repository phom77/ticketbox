import { formatLanguage } from '../i18n';

export function dateFormatter(options: Intl.DateTimeFormatOptions) {
  return localeFormatter((locale) => new Intl.DateTimeFormat(locale, options));
}

export function numberFormatter(options?: Intl.NumberFormatOptions) {
  return localeFormatter((locale) => new Intl.NumberFormat(locale, options));
}

function localeFormatter<T>(create: (locale: string) => { format(value: T): string }) {
  let locale: string | undefined;
  let formatter: ReturnType<typeof create>;
  return {
    format(value: T) {
      const current = formatLanguage();
      if (locale !== current) {
        formatter = create(current);
        locale = current;
      }
      return formatter.format(value);
    },
  };
}

export const currency = numberFormatter({
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

export const eventDate = dateFormatter({
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
