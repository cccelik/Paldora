'use client';

import type { AppearancePreference } from '@paldora/domain';
import { useEffect } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';

export function applyAppearance(appearance: AppearancePreference) {
  document.documentElement.dataset.appearance = appearance;
  localStorage.setItem('paldora:appearance', appearance);
}

export function AppAppearanceBridge() {
  useEffect(() => {
    const stored = localStorage.getItem('paldora:appearance');
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      applyAppearance(stored);
    }
    void createBrowserApiClient()
      .preferences()
      .then(({ appearance }) => applyAppearance(appearance))
      .catch(() => undefined);
  }, []);
  return null;
}
