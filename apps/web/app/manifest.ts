import { tokens } from '@paldora/tokens';
import { type MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Paldora',
    short_name: 'Paldora',
    description: 'A private living scrapbook for the people you keep close.',
    start_url: '/',
    display: 'standalone',
    background_color: tokens['color.brand.obsidian'],
    theme_color: tokens['color.brand.obsidian'],
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
