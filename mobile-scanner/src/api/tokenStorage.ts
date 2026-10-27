import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { StaffUser } from './types';

const ACCESS_TOKEN_KEY = 'ticketbox.accessToken';
const STAFF_USER_KEY = 'ticketbox.staffUser';
const DEVICE_ID_KEY = 'ticketbox.deviceId';

export function saveAccessToken(accessToken: string) {
  return setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function getAccessToken() {
  return getItem(ACCESS_TOKEN_KEY);
}

export function deleteAccessToken() {
  return deleteItem(ACCESS_TOKEN_KEY);
}

export function saveStaffUser(user: StaffUser) {
  return setItem(STAFF_USER_KEY, JSON.stringify(user));
}

export async function getStaffUser() {
  const rawUser = await getItem(STAFF_USER_KEY);

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as StaffUser;
  } catch {
    await deleteStaffUser();
    return null;
  }
}

export function deleteStaffUser() {
  return deleteItem(STAFF_USER_KEY);
}

export async function getOrCreateDeviceId() {
  const existingDeviceId = await getItem(DEVICE_ID_KEY);

  if (existingDeviceId) {
    return existingDeviceId;
  }

  const deviceId = createDeviceId();
  await setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

export function getDeviceId() {
  return getItem(DEVICE_ID_KEY);
}

export function saveDeviceId(deviceId: string) {
  return setItem(DEVICE_ID_KEY, deviceId);
}

function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    writeCookie(key, value);
    return Promise.resolve();
  }

  return SecureStore.setItemAsync(key, value);
}

function getItem(key: string) {
  if (Platform.OS === 'web') {
    return Promise.resolve(readCookie(key));
  }

  return SecureStore.getItemAsync(key);
}

function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    deleteCookie(key);
    return Promise.resolve();
  }

  return SecureStore.deleteItemAsync(key);
}

function createDeviceId() {
  return `ticketbox-scanner-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function writeCookie(key: string, value: string) {
  document.cookie = `${key}=${encodeURIComponent(value)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

function readCookie(key: string) {
  const prefix = `${key}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function deleteCookie(key: string) {
  document.cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax`;
}
