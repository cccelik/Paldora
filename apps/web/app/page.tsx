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
        <a className="landing-signin" href="/sign-in">
          Sign in
        </a>
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
        <p className="postcard-kicker">Private spaces · Real friendships</p>
        <h2>
          Your people, in one place.
          <br />
          Your memories, kept close.
        </h2>
        <p>
          Paldora is a private living scrapbook built for the friends who are
          actually part of your life.
        </p>
        <div className="architecture">
          <span>Private by default</span>
          <b>→</b>
          <span>Chronological</span>
          <b>→</b>
          <span>No targeted ads</span>
          <b>→</b>
          <span>Made to last</span>
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
