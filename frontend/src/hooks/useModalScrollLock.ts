import { useEffect } from 'react';

let activeLocks = 0;
let previousOverflow = '';
let previousPaddingRight = '';

/** Locks the document behind a modal while leaving the modal's own content scrollable. */
export function useModalScrollLock() {
  useEffect(() => {
    const { body, documentElement } = document;

    if (activeLocks === 0) {
      previousOverflow = body.style.overflow;
      previousPaddingRight = body.style.paddingRight;

      const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    }

    activeLocks += 1;

    return () => {
      activeLocks -= 1;
      if (activeLocks === 0) {
        body.style.overflow = previousOverflow;
        body.style.paddingRight = previousPaddingRight;
      }
    };
  }, []);
}
