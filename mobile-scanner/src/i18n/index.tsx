import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { defaultLanguage, readLanguage, setCurrentLanguage, writeLanguage } from './preference';
import vi from './vi.json';
import en from './en.json';

export type MessageKey = keyof typeof vi;
const catalogs = { vi, en } satisfies Record<string, Record<MessageKey, string>>;
export type Language = keyof typeof catalogs;
function isLanguage(value: string | null): value is Language {
  return value !== null && Object.prototype.hasOwnProperty.call(catalogs, value);
}

export type Translate = (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string;

export const languages = {
  vi: { name: 'Tiếng Việt', locale: 'vi-VN' },
  en: { name: 'English', locale: 'en' },
} satisfies Record<Language, { name: string; locale: string }>;

const LanguageContext = createContext<{
  language: Language;
  selectLanguage: (language: Language) => void;
  t: Translate;
  locale: string;
  number: (value: number) => string;
} | null>(null);

export function ScannerLanguageProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [ready, setReady] = useState(false);
  const pendingWrite = useRef(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    void readLanguage().then((saved) => {
      if (mounted && isLanguage(saved)) {
        setCurrentLanguage(saved);
        setLanguage(saved);
      }
    }).catch(() => undefined).finally(() => {
      if (mounted) setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') document.documentElement.lang = language;
  }, [language]);

  function selectLanguage(next: Language) {
    setCurrentLanguage(next);
    setLanguage(next);
    pendingWrite.current = pendingWrite.current.then(() => writeLanguage(next)).catch(() => undefined);
  }

  const locale = languages[language].locale;
  const t: Translate = (key, values) => catalogs[language][key].replace(
    /\{(\w+)\}/g,
    (placeholder, name: string) => String(values?.[name] ?? placeholder),
  );
  return (
    <LanguageContext.Provider value={{ language, selectLanguage, locale, t, number: (value) => value.toLocaleString(locale) }}>
      {ready ? children : fallback}
    </LanguageContext.Provider>
  );
}

export function useScannerLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('Scanner language provider is missing');
  return context;
}

export function formatDateTime(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function syncSummaryText(
  t: Translate,
  number: (value: number) => string,
  summary: { accepted: number; skipped: number; invalid: number },
) {
  return t('syncSummary', { accepted: number(summary.accepted), skipped: number(summary.skipped), invalid: number(summary.invalid) });
}
