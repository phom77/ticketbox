/** Queue presentation helpers. */

/** An honest range around the server estimate, in whole minutes. */
export function etaRange(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const low = Math.max(1, Math.floor((seconds * 0.8) / 60));
  const high = Math.max(low, Math.ceil((seconds * 1.25) / 60));
  return { low, high };
}

/** Progress through the queue from the largest number of people ahead seen so far. */
export function queueProgress(ahead: number | null | undefined, startedAt: number) {
  if (ahead == null || startedAt <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - ahead / startedAt));
}

export type ChecklistState = { signedIn: boolean; paymentReady: boolean; quantity: number };

export function checklistComplete(state: ChecklistState) {
  return state.signedIn && state.paymentReady && state.quantity >= 1;
}
