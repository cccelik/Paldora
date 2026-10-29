import { type MetadataRoute } from 'next';

/** Paldora is private and invite-only: no crawler is welcome anywhere. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
