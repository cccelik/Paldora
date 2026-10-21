import {
  updateRoomSchema,
  updateRoomTopFriendsSchema,
  updateRoomWidgetsSchema,
} from '@paldora/validation';
import { z } from 'zod';

/**
 * Customizer form fields → Room API bodies. Server Actions are public
 * endpoints, so each body is validated by the same shared schema the API
 * uses before it is sent, and the API checks it again. Every body carries
 * `expectedUpdatedAt` (an empty field means a never-saved Room).
 */

/**
 * Hands a parsed form to a shared API schema. The form's own types are
 * looser (plain strings), so the shared schema is what decides validity.
 */
const loose = (value: unknown): unknown => value;

const version = z.string().transform((value) => (value === '' ? null : value));

/** An empty choice means "follow the theme" (null). */
const followable = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === '' ? null : value));

const appearanceFields = z.object({
  section: z.literal('appearance'),
  themePreset: z.string(),
  layout: z.string(),
  accent: followable,
  font: followable,
  decorationPack: followable,
  sparkles: z.string().optional(),
  expectedUpdatedAt: version,
});

const audienceFields = z.object({
  section: z.literal('audience'),
  visibility: z.string(),
  expectedUpdatedAt: version,
});

const aboutFields = z.object({
  section: z.literal('about'),
  location: z.string().default(''),
  currently: z.string().default(''),
  musicUrl: z.string().default(''),
  musicTitle: z.string().default(''),
  musicArtist: z.string().default(''),
  expectedUpdatedAt: version,
});

type AboutFields = z.output<typeof aboutFields>;

/** No link means no music card; a title or artist alone is a mistake. */
function music(form: AboutFields, context: z.RefinementCtx) {
  if (form.musicUrl.trim() === '') {
    if (form.musicTitle.trim() !== '' || form.musicArtist.trim() !== '') {
      context.addIssue({
        code: 'custom',
        message: 'Add the song’s link, or clear its title and artist.',
      });
    }
    return null;
  }
  return {
    url: form.musicUrl,
    title: form.musicTitle,
    artist: form.musicArtist,
  };
}

/** One customizer section (appearance, audience, or about) as a PATCH. */
export const roomSettingsFormSchema = z
  .discriminatedUnion('section', [
    appearanceFields,
    audienceFields,
    aboutFields,
  ])
  .transform((form, context): unknown => {
    switch (form.section) {
      case 'appearance':
        return {
          themePreset: form.themePreset,
          layout: form.layout,
          accent: form.accent,
          font: form.font,
          decorationPack: form.decorationPack,
          sparkles: form.sparkles === 'on',
          expectedUpdatedAt: form.expectedUpdatedAt,
        };
      case 'audience':
        return {
          visibility: form.visibility,
          expectedUpdatedAt: form.expectedUpdatedAt,
        };
      case 'about':
        return {
          location: form.location,
          currently: form.currently,
          music: music(form, context),
          expectedUpdatedAt: form.expectedUpdatedAt,
        };
    }
  })
  .pipe(updateRoomSchema);

/** Attach (an id) or remove (null) the banner. */
export const roomBannerInputSchema = z
  .object({
    bannerMediaId: z.string().nullable(),
    expectedUpdatedAt: z.string().nullable(),
  })
  .strict()
  .transform(loose)
  .pipe(updateRoomSchema);

const json = z.string().transform((value, context) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    context.addIssue({ code: 'custom', message: 'Reload and try again.' });
    return z.NEVER;
  }
});

/** All seven widgets in order (`widgets` is a JSON list). */
export const roomWidgetsFormSchema = z
  .object({ widgets: json, expectedUpdatedAt: version })
  .transform(loose)
  .pipe(updateRoomWidgetsSchema);

/** The ordered Top Friends (`userIds` is a JSON list), size, and audience. */
export const roomTopFriendsFormSchema = z
  .object({
    userIds: json,
    size: z.coerce.number(),
    visibility: z.string(),
    expectedUpdatedAt: version,
  })
  .transform(loose)
  .pipe(updateRoomTopFriendsSchema);

/** Which section a settings form saved, for its success message. */
export const SECTION_SAVED: Readonly<Record<string, string>> = {
  appearance: 'Appearance saved.',
  audience: 'Audience saved.',
  about: 'About saved.',
};
