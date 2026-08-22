const promises = [
  'Private by default',
  'Chronological, always',
  'Made to last',
];

export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Paldora home">
          <span aria-hidden="true">✦</span> Paldora
        </a>
        <div className="status-pill">
          <span /> Foundation online
        </div>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">A quieter corner of the internet</div>
        <h1>
          A box for
          <br />
          <em>your people.</em>
        </h1>
        <p className="intro">
          The private living scrapbook for the friendships, tiny moments, and
          chapters you want to keep.
        </p>
        <div className="promise-row" aria-label="Paldora promises">
          {promises.map((promise) => (
            <span key={promise}>✧ {promise}</span>
          ))}
        </div>
      </section>

      <section className="postcard" aria-label="Product foundation status">
        <div className="tape" />
        <p className="postcard-kicker">August 2026 · Foundation</p>
        <h2>
          Expression on the surface.
          <br />
          Discipline underneath.
        </h2>
        <p>
          The web, API, worker, and mobile foundations now share strict
          contracts without sharing responsibilities.
        </p>
        <div className="architecture">
          <span>Next.js</span>
          <b>→</b>
          <span>Typed API</span>
          <b>→</b>
          <span>NestJS</span>
          <b>→</b>
          <span>PostgreSQL</span>
        </div>
      </section>

      <footer>
        <span>✦</span>
        <p>Your memories remain yours.</p>
        <span>✦</span>
      </footer>
    </main>
  );
}
