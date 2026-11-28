import { useEffect, type RefObject } from 'react';

/** Closes a popover on an outside pointer press; Escape is handled by the popover content. */
export function useOutsidePress(
  open: boolean,
  refs: RefObject<HTMLElement | null>[],
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    function onPress(event: MouseEvent) {
      if (refs.every((ref) => !ref.current?.contains(event.target as Node))) close();
    }
    document.addEventListener('mousedown', onPress);
    return () => document.removeEventListener('mousedown', onPress);
  }, [open, refs, close]);
}
