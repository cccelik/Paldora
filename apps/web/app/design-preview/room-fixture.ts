import { type RoomPreviews } from '@/components/rooms/room-canvas';
import {
  DEFAULT_ROOM_WIDGETS,
  ROOM_THEME_PRESETS,
  type RoomThemePreset,
} from '@paldora/domain';
import { type RoomView } from '@paldora/validation';

/** A fixed, fake Room (Figma page 07 template) for the theme preview route. */
const IDS = {
  owner: '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10',
  leah: '0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a22',
  jonah: '1b8d2e7f-3a24-4e9c-8a65-6d4f7e2c8b33',
  maya: '2c9e3f80-4b35-4fad-9b76-7e5a8f3d9c44',
  sam: '3daf4091-5c46-40be-8c87-8f6b9a4ead55',
  post: '3b9d2c1e-6a5f-4e7d-8c3b-2a1f0e9d8c7b',
  box: '5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b',
} as const;

export function isRoomThemePreset(value: string): value is RoomThemePreset {
  return (ROOM_THEME_PRESETS as readonly string[]).includes(value);
}

const friend = (id: string, username: string, displayName: string) => ({
  id,
  username,
  displayName,
  avatarUrl: null,
});

export function previewRoom(themePreset: RoomThemePreset): RoomView {
  return {
    owner: {
      id: IDS.owner,
      username: 'alice.moreau',
      displayName: 'Alice Moreau',
      bio: 'Collecting small good days.',
      avatarUrl: null,
    },
    relationship: 'friend',
    style: {
      themePreset,
      layout: 'single',
      accent: null,
      font: null,
      decorationPack: null,
      sparkles: false,
    },
    location: 'Lisbon → Berlin',
    currently:
      'Reading Piranesi, failing at sourdough, missing the sea a little.',
    music: {
      url: 'https://music.example.com/says',
      title: 'Says',
      artist: 'Nils Frahm',
    },
    banner: null,
    widgets: DEFAULT_ROOM_WIDGETS.map((widget) => ({ ...widget })),
    topFriends: {
      size: null,
      visibility: null,
      items: [
        friend(IDS.leah, 'leah', 'Leah'),
        friend(IDS.jonah, 'jonah', 'Jonah'),
        friend(IDS.maya, 'maya', 'Maya'),
        friend(IDS.sam, 'sam', 'Sam'),
      ],
    },
    visibility: null,
    updatedAt: null,
    configurationVersion: 1,
  };
}

export const previewPreviews: RoomPreviews = {
  posts: [
    {
      id: IDS.post,
      box: { id: IDS.box, name: 'Crew' },
      author: friend(IDS.owner, 'alice.moreau', 'Alice Moreau'),
      content: 'Dinner on Sunday, everyone bring something warm.',
      media: [],
      createdAt: '2026-10-20T10:00:00.000Z',
      editedAt: null,
      canEdit: false,
      interactions: {} as never,
      kind: 'post',
      lifeUpdateId: null,
    },
  ],
  lifeUpdates: [],
  photos: [],
  memories: { years: [{ year: 2026, count: 1 }], year: 2026, months: [] },
};
