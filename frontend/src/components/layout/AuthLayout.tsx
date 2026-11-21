import { useEffect, useRef, type ReactNode } from 'react';
import { LanguageSelect } from '../LanguageSelect';
import { Logo } from './PublicLayout';
import './AuthLayout.css';

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="buyer-auth">
      <header className="buyer-auth-top">
        <div className="page-width">
          <Logo />
          <LanguageSelect />
        </div>
      </header>
      <main className="buyer-auth-main">
        <section className="buyer-auth-card" aria-labelledby="auth-title">
          <header className="buyer-auth-heading">
            <h1 id="auth-title">{title}</h1>
            {description}
          </header>
          {children}
        </section>
      </main>
    </div>
  );
}

export function AuthError({ message }: { message: string | null }) {
  const alert = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (message) alert.current?.focus();
  }, [message]);

  return message ? (
    <div className="buyer-auth-feedback" role="alert" tabIndex={-1} ref={alert}>
      <p>{message}</p>
    </div>
  ) : null;
}
