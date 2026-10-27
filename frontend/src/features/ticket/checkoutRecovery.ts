import { ApiClientError } from '../../api/client';
import { createOrder, getOrderByIdempotencyKey } from '../../api/orders';

type BasketItem = { ticketTypeId: string; quantity: number };
const DRAFT_KEY = 'ticketbox.checkout-request';

// Reuse the same command across reloads only for the same basket and queue session.
export function checkoutRequestKey(concertId: string, items: BasketItem[], queueToken: string) {
  const basket = JSON.stringify({ concertId, items: [...items].sort((a, b) =>
    a.ticketTypeId.localeCompare(b.ticketTypeId)), queueToken });
  try {
    const stored = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
    if (stored?.basket === basket && typeof stored.key === 'string' && stored.key.length > 0 && stored.key.length <= 128) {
      return stored.key as string;
    }
  } catch { /* Continue with an in-memory key if browser storage is unavailable. */ }
  const key = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ basket, key })); } catch { /* Optional persistence. */ }
  return key;
}

export function clearCheckoutRequest(key: string) {
  try {
    if (JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null')?.key === key) {
      sessionStorage.removeItem(DRAFT_KEY);
    }
  } catch { /* Optional persistence. */ }
}

export async function createOrRecoverOrder(
  concertId: string, items: BasketItem[], key: string, queueToken: string,
) {
  // A previous request may have committed and consumed its queue session.
  // Resolve that order before attempting another write, even after a reload.
  try {
    return await getOrderByIdempotencyKey(key);
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status !== 404) throw error;
  }
  try {
    return await createOrder(concertId, items, key, queueToken);
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 409 || error.status >= 500)) {
      // Allow a concurrent commit to become visible after a lost response or duplicate request.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try { return await getOrderByIdempotencyKey(key); }
        catch (lookupError) {
          if (!(lookupError instanceof ApiClientError) || lookupError.status !== 404) break;
        }
        if (attempt < 3) await new Promise(resolve => window.setTimeout(resolve, 500));
      }
    }
    throw error;
  }
}
