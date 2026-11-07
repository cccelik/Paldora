import localFont from 'next/font/local';

/**
 * Self-hosted Hearth & Brass type (ADR 024). Files live in `app/fonts` with
 * their SIL OFL texts; nothing is fetched at runtime, so the CSP keeps
 * `font-src 'self'`. Each loader exposes its face through a CSS variable that
 * the generated `--pal-font-*` stacks start with.
 */
export const fraunces = localFont({
  src: [
    {
      path: './fonts/Fraunces-Variable.woff2',
      style: 'normal',
      weight: '300 500',
    },
    {
      path: './fonts/Fraunces-Italic-Variable.woff2',
      style: 'italic',
      weight: '300 500',
    },
  ],
  variable: '--font-fraunces',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

export const geist = localFont({
  src: './fonts/Geist-Variable.woff2',
  weight: '100 900',
  variable: '--font-geist',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

export const geistMono = localFont({
  src: './fonts/GeistMono-Variable.woff2',
  weight: '100 900',
  variable: '--font-geist-mono',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
});

export const fontVariableClasses = [
  fraunces.variable,
  geist.variable,
  geistMono.variable,
].join(' ');
