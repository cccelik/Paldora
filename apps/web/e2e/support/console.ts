import { type Page } from '@playwright/test';
/** Collects console errors, which include CSP violations and hydration bugs. */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}
