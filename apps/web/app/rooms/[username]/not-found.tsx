import Link from 'next/link';

export default function RoomNotFound() {
  return (
    <main className="auth-shell room-state-page">
      <section className="auth-card">
        <span className="room-state-symbol" aria-hidden="true">
          ◇
        </span>
        <p className="eyebrow">Room unavailable</p>
        <h1>This Room can’t be opened.</h1>
        <p>
          It may be hidden, blocked, missing, or outside your access. Paldora
          keeps those cases indistinguishable.
        </p>
        <Link className="button-primary" href="/home">
          Return home
        </Link>
      </section>
    </main>
  );
}
