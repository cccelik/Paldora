import type { RoomDecorationPack } from '@paldora/domain';
import styles from './room-decoration.module.css';

/** Unicode glyphs only: no images, no fonts, nothing fetched. */
const glyphs: Readonly<Record<RoomDecorationPack, readonly string[]>> = {
  none: [],
  stars: ['✦', '✧', '⋆'],
  flowers: ['✿', '❀', '✾'],
  stickers: ['♥', '★', '☺'],
  tape: [],
  pixels: ['▪', '▫', '▪'],
};

/**
 * One static cluster in the banner corner. Decorative: hidden from
 * assistive tech, never in the way of the pointer, dropped under
 * `prefers-contrast: more`, and never behind text.
 */
export function RoomDecoration({ pack }: { pack: RoomDecorationPack }) {
  if (pack === 'none') return null;
  if (pack === 'tape') {
    return (
      <span className={`${styles.layer} ${styles.tape}`} aria-hidden="true">
        <span className={styles.strip} />
        <span className={styles.strip} />
      </span>
    );
  }
  return (
    <span className={`${styles.layer} ${styles.cluster}`} aria-hidden="true">
      {glyphs[pack].map((glyph, index) => (
        <span key={index} className={styles.glyph}>
          {glyph}
        </span>
      ))}
    </span>
  );
}

/**
 * At most six sparkles in the banner. They fade slowly only when the
 * viewer has not asked for reduced motion; otherwise they hold still.
 */
export function RoomSparkles() {
  return (
    <span className={`${styles.layer} ${styles.sparkles}`} aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} className={styles.sparkle}>
          ✦
        </span>
      ))}
    </span>
  );
}
