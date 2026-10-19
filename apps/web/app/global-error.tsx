'use client';

/**
 * Last-resort boundary that replaces the root layout, so global styles and
 * tokens are unavailable. Plain semantic markup keeps it readable regardless.
 */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Paldora is having trouble.</h1>
          <p>Nothing you shared was lost. Please try again in a moment.</p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
