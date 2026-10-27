const AUTH_TOKEN_COOKIE = 'ticketbox_auth_token';
const LEGACY_AUTH_TOKEN_KEY = 'token';

export function getAuthToken() {
  const token = readCookie(AUTH_TOKEN_COOKIE);
  if (token) return token;

  const legacyToken = localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
  if (legacyToken) {
    saveAuthToken(legacyToken);
    localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    return legacyToken;
  }

  return null;
}

export function saveAuthToken(token: string) {
  const maxAge = secondsUntilExpiry(token);
  document.cookie = [
    `${AUTH_TOKEN_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'SameSite=Lax',
    location.protocol === 'https:' ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

export function clearAuthToken() {
  localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  document.cookie = `${AUTH_TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function readCookie(name: string) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function secondsUntilExpiry(token: string) {
  const fallbackSeconds = 24 * 60 * 60;

  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return fallbackSeconds;
    const payload = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (!payload.exp) return fallbackSeconds;
    return Math.max(60, Math.floor(payload.exp - Date.now() / 1000));
  } catch {
    return fallbackSeconds;
  }
}
