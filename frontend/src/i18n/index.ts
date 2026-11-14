import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

export const languages = [
  { code: 'vi', name: 'Tiếng Việt', format: 'vi-VN' },
  { code: 'en', name: 'English', format: 'en' },
] as const;
export type Language = (typeof languages)[number]['code'];

const preferenceKey = 'ticketbox.language';

function matchLanguage(tag: string | null | undefined) {
  return languages.find(({ code }) => code === tag?.toLowerCase().split('-')[0])?.code;
}

function initialLanguage() {
  try {
    const saved = matchLanguage(window.localStorage.getItem(preferenceKey));
    if (saved) return saved;
  } catch {
    // Storage can be blocked by browser privacy settings.
  }
  return navigator.languages.map(matchLanguage).find(Boolean) ?? 'vi';
}

const language = initialLanguage();
document.documentElement.lang = language;
const catalogs = import.meta.glob<Record<string, string>>('./*/*.json', {
  eager: true,
  import: 'default',
});
const resources = Object.fromEntries(languages.map(({ code }) => [
  code,
  Object.fromEntries(Object.entries(catalogs)
    .filter(([path]) => path.startsWith(`./${code}/`))
    .map(([path, messages]) => [path.slice(code.length + 3, -5), messages])),
]));

void i18next.use(initReactI18next).init({
  resources,
  defaultNS: 'common',
  lng: language,
  fallbackLng: 'en',
  supportedLngs: languages.map(({ code }) => code),
  interpolation: { escapeValue: false },
  initAsync: false,
});

export function currentLanguage(): Language {
  return matchLanguage(i18next.language) ?? language;
}

export function formatLanguage() {
  return languages.find(({ code }) => code === currentLanguage())?.format ?? 'vi-VN';
}

export async function selectLanguage(next: Language) {
  await i18next.changeLanguage(next);
  document.documentElement.lang = next;
  try {
    window.localStorage.setItem(preferenceKey, next);
  } catch {
    // The current selection remains available in this session.
  }
}

export const translate = i18next.t.bind(i18next);
