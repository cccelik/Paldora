import { type ReactNode } from 'react';
import styles from './onboarding-layout.module.css';
import { Wordmark } from './ui';
const totalSteps = 3;

/** The frame for the three setup steps: username, profile, photo. */
export function OnboardingLayout({
  step,
  title,
  description,
  children,
}: {
  step: 1 | 2 | 3;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark />
        <span className={styles.headerNote}>Setting up your profile</span>
      </header>
      <main id="main" className={styles.card}>
        <ol
          className={styles.steps}
          aria-label={`Step ${step} of ${totalSteps}`}
        >
          {Array.from({ length: totalSteps }, (_, index) => (
            <li
              key={index}
              className={`${styles.step} ${index < step ? styles.done : ''}`}
            />
          ))}
        </ol>
        <p className={styles.eyebrow}>
          Step {step} of {totalSteps}
        </p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.description}>{description}</p>
        {children}
      </main>
    </div>
  );
}
