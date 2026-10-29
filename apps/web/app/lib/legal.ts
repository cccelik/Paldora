/** Shared facts for the public information pages. */

/** Bump when the wording of any public page changes. ISO date. */
export const LEGAL_LAST_UPDATED = '2026-10-29';

export const LEGAL_PAGES = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/guidelines', label: 'Community guidelines' },
  { href: '/contact', label: 'Contact and appeals' },
] as const;
