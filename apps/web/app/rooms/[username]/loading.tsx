export default function RoomLoading() {
  return (
    <main
      className="app-main room-loading-state"
      aria-busy="true"
      aria-label="Loading Room"
    >
      <div className="room-loading-banner" />
      <div className="room-loading-identity" />
      <div className="room-loading-grid">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
