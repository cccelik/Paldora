import widgetStyles from '@/components/rooms/room-widget-parts.module.css';
import customStyles from './room-personalization.module.css';
import styles from '@/components/rooms/room-canvas.module.css';
import {
  RoomDecoration,
  RoomSparkles,
} from '@/components/rooms/room-decoration';
import { RoomWidget, type RoomPreviews } from '@/components/rooms/room-widgets';
import { Avatar } from '@/components/ui';
import {
  roomColumns,
  roomThemeAttributes,
  type PlacedWidget,
} from '@/lib/rooms/room-theme';
import { resolveRoomStyle } from '@paldora/domain';
import {
  type RenderedPersonalization,
  type RoomView,
} from '@paldora/validation';
export type { RoomPreviews } from '@/components/rooms/room-widgets';

/**
 * A Room as its owner styled it. Purely presentational (no hooks, no data
 * access), so the Room page and, later, the customizer's live preview can
 * both render it. Everything inside `.room-canvas` is the person's own
 * expression: no navigation, no forms, no trusted controls, and links only
 * to Rooms, posts, Life Updates, and the external music link.
 */
export function RoomCanvas({
  room,
  previews,
  personalization,
}: {
  room: RoomView;
  previews: RoomPreviews;
  personalization?: RenderedPersonalization;
}) {
  const style = resolveRoomStyle(room.style);
  const columns = roomColumns(style.layout, room.widgets);
  const isOwner = room.relationship === 'owner';
  const widget = (placed: PlacedWidget) => (
    <RoomWidget
      key={placed.type}
      type={placed.type}
      position={placed.position}
      room={room}
      previews={previews}
      isOwner={isOwner}
    />
  );
  return (
    <section
      className={`room-canvas ${styles.canvas}`}
      data-personalization={room.owner.id}
      aria-labelledby="room-owner-name"
      {...roomThemeAttributes(room.style)}
    >
      <div className={styles.banner}>
        {room.banner ? (
          // A signed, expiring storage URL: a plain img, decorative.
          <img
            className={styles.bannerImage}
            src={room.banner.url}
            alt=""
            width={1600}
            height={533}
            referrerPolicy="no-referrer"
          />
        ) : null}
        <RoomDecoration pack={style.decoration} />
        {style.sparkles ? <RoomSparkles /> : null}
      </div>
      <header className={styles.identity}>
        <span className={styles.avatar}>
          <Avatar
            url={room.owner.avatarUrl}
            name={room.owner.displayName}
            size="large"
          />
        </span>
        <div className={styles.names}>
          <h1
            id="room-owner-name"
            className={`pal-custom-title ${styles.name}`}
          >
            {room.owner.displayName}
          </h1>
          <p className={styles.username}>@{room.owner.username}</p>
          {room.location ? (
            <p className={styles.location}>
              <span className="visually-hidden">Location: </span>
              {room.location}
            </p>
          ) : null}
          {room.owner.bio ? (
            <p className={`pal-custom-text ${styles.bio}`}>{room.owner.bio}</p>
          ) : null}
        </div>
      </header>
      {style.layout === 'single' ? (
        <div className={styles.single}>{columns.main.map(widget)}</div>
      ) : (
        <div className={styles.columns}>
          <div className={styles.sidebar}>{columns.sidebar.map(widget)}</div>
          <div className={styles.main}>{columns.main.map(widget)}</div>
        </div>
      )}
      {personalization?.widgets.length ? (
        <div className={customStyles.widgets}>
          {personalization.widgets.map((widget, index) => (
            <section
              key={index}
              className={`pal-custom-card ${widgetStyles.widget}`}
              aria-label={widget.title}
            >
              <h2 className={widgetStyles.title}>{widget.title}</h2>
              <iframe
                className={customStyles.frame}
                title={widget.title}
                sandbox=""
                referrerPolicy="no-referrer"
                srcDoc={widget.document}
              />
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}
