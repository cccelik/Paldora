import '@paldora/tokens/tokens.css';
import { type Metadata, type Viewport } from 'next';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { type ReactNode } from 'react';
import './globals.css';
import { APPEARANCE_COOKIE, appearanceAttribute } from './lib/appearance';
export const metadata: Metadata = {
  title: {
    default: 'Paldora — A box for your people',
    template: '%s · Paldora',
  },
  description:
    'A private living scrapbook for your friendships, tiny moments, and the chapters you want to keep.',
  robots: { index: true, follow: false },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF7EF' },
    { media: '(prefers-color-scheme: dark)', color: '#11100E' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // Every page renders per request so the proxy's CSP nonce can be applied.
  await connection();
  // Server-rendered, so the chosen theme never flashes before hydration.
  const appearance = appearanceAttribute(
    (await cookies()).get(APPEARANCE_COOKIE)?.value,
  );
  return (
    <html lang="en" data-appearance={appearance}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
