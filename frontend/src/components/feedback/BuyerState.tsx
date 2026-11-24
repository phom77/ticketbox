import type { ReactNode } from 'react';
import './buyerFeedback.css';

type Tone = 'info' | 'loading' | 'empty' | 'error';

/**
 * The standard buyer message for loading, empty, filtered-empty and failed states.
 * Errors are alerts; loading is a polite status; empty states are plain content.
 */
export function BuyerState({
  tone = 'info',
  title,
  headingLevel = 2,
  children,
  actions,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  const role = tone === 'error' ? 'alert' : tone === 'loading' ? 'status' : undefined;
  return (
    <div
      className={['buyer-state', className].filter(Boolean).join(' ')}
      data-tone={tone}
      role={role}
    >
      {title ? <Heading>{title}</Heading> : null}
      {children ? typeof children === 'string' ? <p>{children}</p> : children : null}
      {actions ? <div className="buyer-state-actions">{actions}</div> : null}
    </div>
  );
}
