'use client';

export default function RoomError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="auth-shell room-state-page">
      <section className="auth-card">
        <span className="room-state-symbol" aria-hidden="true">
          !
        </span>
        <p className="eyebrow">Room interrupted</p>
        <h1>We couldn’t finish loading this Room.</h1>
        <p>Your access has not changed. Check the connection and try again.</p>
        <button className="button-primary" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
