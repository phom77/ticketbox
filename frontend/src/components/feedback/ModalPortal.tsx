import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';

type ModalPortalProps = {
  children: ReactNode;
};

/**
 * Mounts modal UI at the document root so route animations and layout containers
 * cannot change the viewport positioning of a fixed backdrop.
 */
export function ModalPortal({ children }: ModalPortalProps) {
  useModalScrollLock();

  return createPortal(children, document.body);
}
