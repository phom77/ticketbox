import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Language } from './index';

const key = 'ticketbox.language';

export async function readLanguage() {
  return Platform.OS === 'web' ? window.localStorage.getItem(key) : SecureStore.getItemAsync(key);
}

export async function writeLanguage(language: Language) {
  if (Platform.OS === 'web') window.localStorage.setItem(key, language);
  else await SecureStore.setItemAsync(key, language);
}


export const defaultLanguage = 'vi';
let requestLanguage: Language = defaultLanguage;

export function currentLanguage() {
  return requestLanguage;
}

export function setCurrentLanguage(language: Language) {
  requestLanguage = language;
}
