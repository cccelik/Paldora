import type { ReactNode } from 'react';
import { Wordmark } from './wordmark';

export function OnboardingLayout({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <Wordmark />
        <span>Profile setup</span>
      </header>
      <section className="onboarding-card">
        <div className="step-track" aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((item) => (
            <span className={item <= step ? 'active' : ''} key={item} />
          ))}
        </div>
        <p className="eyebrow">Step {step} of 3</p>
        <h1>{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
      </section>
    </main>
  );
}
