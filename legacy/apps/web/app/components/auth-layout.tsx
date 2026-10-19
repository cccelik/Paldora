import type { ReactNode } from 'react';
import { Wordmark } from './wordmark';

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-story" aria-hidden="true">
        <Wordmark />
        <div>
          <p className="eyebrow">A quieter corner of the internet</p>
          <blockquote>“The good stuff was always meant to be kept.”</blockquote>
        </div>
        <p className="auth-footnote">Private by default · Made to last</p>
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand">
          <Wordmark />
        </div>
        <div className="auth-card">
          <p className="eyebrow">Paldora access</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
          <p className="demo-note">
            Access is limited to provisioned demo accounts.
          </p>
        </div>
      </section>
    </main>
  );
}
