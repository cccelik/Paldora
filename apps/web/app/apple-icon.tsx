import { tokens } from '@paldora/tokens';
import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** The four-point star on Obsidian Ink, drawn from brand tokens. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: tokens['color.brand.obsidian'],
      }}
    >
      <svg width="180" height="180" viewBox="0 0 64 64">
        <path
          d="M32 9 L37.5 26.5 L55 32 L37.5 37.5 L32 55 L26.5 37.5 L9 32 L26.5 26.5 Z"
          fill={tokens['color.brand.gold']}
        />
      </svg>
    </div>,
    size,
  );
}
