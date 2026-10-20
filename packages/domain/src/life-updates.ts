/**
 * Life Updates (Phase 6): a structured update stored once and delivered to
 * up to 20 Boxes (one backing post each) or kept Only Me. The section keys
 * are fixed here; the database checks only the shape and the lengths, so a
 * new section needs no migration. The order of the keys is canonical.
 */
export const LIFE_UPDATE_SECTION_KEYS = [
  'lifeLately',
  'workOrUniversity',
  'travel',
  'currentlyInto',
  'listeningTo',
  'watching',
  'reading',
  'excitedAbout',
  'whatsNext',
] as const;
export type LifeUpdateSectionKey = (typeof LIFE_UPDATE_SECTION_KEYS)[number];

export const LIFE_UPDATE_SECTION_LABELS: Readonly<
  Record<LifeUpdateSectionKey, string>
> = {
  lifeLately: 'Life lately',
  workOrUniversity: 'Work or university',
  travel: 'Travel',
  currentlyInto: 'Currently into',
  listeningTo: 'Listening to',
  watching: 'Watching',
  reading: 'Reading',
  excitedAbout: 'Something I’m excited about',
  whatsNext: 'What’s next',
};

export const LIFE_UPDATE_SECTION_MAX_LENGTH = 2_000;
export const LIFE_UPDATE_TOTAL_MAX_LENGTH = 10_000;
/** Also enforced by the database (delivery positions 0–19). */
export const LIFE_UPDATE_MAX_BOXES = 20;
export const LIFE_UPDATE_MEDIA_MAX_ITEMS = 4;

export const LIFE_UPDATE_AUDIENCES = ['only_me', 'boxes'] as const;
export type LifeUpdateAudience = (typeof LIFE_UPDATE_AUDIENCES)[number];

export const LIFE_UPDATE_STATUSES = ['active', 'deleted'] as const;
export type LifeUpdateStatus = (typeof LIFE_UPDATE_STATUSES)[number];

export const POST_KINDS = ['post', 'life_update'] as const;
/** `life_update` is the backing post of one Life Update delivery. */
export type PostKind = (typeof POST_KINDS)[number];
