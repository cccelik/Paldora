import {
  ROOM_THEME_PRESETS,
  roomThemeRegistry,
  type CurrentUser,
  type Friendship,
  type Post,
  type RoomId,
  type RoomThemePreset,
  type RoomView,
  type UserId,
} from '@paldora/domain';
import { notFound } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { AppearanceForm } from '../../components/appearance-form';
import { RoomCanvas } from '../../components/room-canvas';
import { RoomEditor } from '../../components/room-editor';
import { RoomTopFriendsPreview } from '../../components/room-top-friends-preview';
import { PageHeader, SurfaceCard } from '../../components/ui';

const ownerId = '71000000-0000-4000-8000-000000000001' as UserId;
const previewUser: CurrentUser = {
  user: {
    id: ownerId,
    email: 'alice@example.com',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  profile: {
    userId: ownerId,
    username: 'alice_moreno',
    displayName: 'Alice Moreno',
    bio: 'Collecting little moments, long walks, and songs worth replaying.',
    avatarUrl: null,
    reactionPresets: ['👍', '❤️', '😂', '😮', '🙏'],
    onboardingState: 'complete',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
};

const friendNames = [
  'Maya Chen',
  'Noah Williams',
  'Sofia Kaya',
  'Emre Demir',
  'Lina Park',
  'Jon Bell',
];
const friends: Friendship[] = friendNames.map((name, index) => ({
  id: `72000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as Friendship['id'],
  user: {
    id: `73000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as UserId,
    username: name.toLowerCase().replace(' ', '_'),
    displayName: name,
    avatarUrl: null,
  },
  status: 'accepted',
  direction: 'established',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}));

const post: Post = {
  id: '74000000-0000-4000-8000-000000000001' as Post['id'],
  boxId: '75000000-0000-4000-8000-000000000001' as Post['boxId'],
  boxName: 'Sunday people',
  author: {
    userId: ownerId,
    username: 'alice_moreno',
    displayName: 'Alice Moreno',
    avatarUrl: null,
  },
  content:
    'Made peach iced tea, finished the tiny photo book, and stayed outside until the streetlights came on.',
  media: [],
  interactions: {
    commentCount: 4,
    reactions: [{ kind: '❤️', count: 6 }],
    currentUserReaction: null,
    realReactions: [],
  },
  status: 'active',
  editedAt: null,
  createdAt: '2026-08-20T18:30:00.000Z',
  updatedAt: '2026-08-20T18:30:00.000Z',
};

export default async function PhaseSevenDesignPreview({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string; theme?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { screen, theme: requestedTheme } = await searchParams;
  const theme = ROOM_THEME_PRESETS.includes(requestedTheme as RoomThemePreset)
    ? (requestedTheme as RoomThemePreset)
    : 'cream_paper';
  const room = previewRoom(theme);
  if (screen === 'editor') {
    return (
      <AppShell active="room" current={previewUser}>
        <PageHeader
          description="A structured, safe editor with explicit saving and responsive preview."
          eyebrow="Safe personalization"
          title="Customize your Room"
        />
        <RoomEditor friends={friends} initialRoom={room} />
      </AppShell>
    );
  }
  if (screen === 'top-friends') {
    return (
      <AppShell active="room" current={previewUser}>
        <PageHeader
          description="Choose, filter, and privately order up to twelve accepted friends."
          eyebrow="Room relationships"
          title="My people"
        />
        <SurfaceCard title="Top Friends editor">
          <RoomTopFriendsPreview friends={friends} initialRoom={room} />
        </SurfaceCard>
      </AppShell>
    );
  }
  if (screen === 'top-friends-options') {
    return (
      <AppShell active="room" current={previewUser}>
        <PageHeader
          description="Independent visibility and layouts for four, eight, or twelve friends—without public ranking language."
          eyebrow="Privacy and layout board"
          title="My people options"
        />
        <div className="room-design-board">
          <SurfaceCard title="Top 4 · Visible">
            <RoomTopFriendsPreview
              friends={friends.slice(0, 4)}
              initialRoom={{
                ...room,
                topFriendsSize: 4,
                topFriendsVisibility: 'visible',
              }}
            />
          </SurfaceCard>
          <SurfaceCard title="Top 8 · Friends only">
            <RoomTopFriendsPreview
              friends={friends}
              initialRoom={{ ...room, topFriendsVisibility: 'friends' }}
            />
          </SurfaceCard>
        </div>
      </AppShell>
    );
  }
  if (screen === 'music') {
    return (
      <AppShell active="room" current={previewUser}>
        <PageHeader
          description="Safe HTTPS link cards with no autoplay, scraping, embeds, or hosted music."
          eyebrow="Music widget states"
          title="A song for this Room"
        />
        <div className="room-design-board">
          {(['lavender_dream', 'neon_night'] as const).map((preset) => (
            <RoomCanvas
              gallery={emptyPage}
              key={preset}
              lifeUpdates={emptyPage}
              memories={emptyPage}
              posts={emptyPage}
              room={{
                ...previewRoom(preset),
                widgets: room.widgets.map((widget) => ({
                  ...widget,
                  enabled: widget.type === 'music',
                })),
              }}
            />
          ))}
        </div>
      </AppShell>
    );
  }
  if (screen === 'appearance') {
    return (
      <AppShell active="settings" current={previewUser}>
        <PageHeader
          description="Application appearance stays separate from every Room theme."
          eyebrow="Display"
          title="Appearance"
        />
        <SurfaceCard title="Light, Dark, or System">
          <AppearanceForm initial="system" />
        </SurfaceCard>
      </AppShell>
    );
  }
  return (
    <AppShell active="room" current={previewUser}>
      <div className="room-trusted-toolbar">
        <span className="privacy-pill">Friends Only</span>
        <span className="relationship-pill">
          Preview · {roomThemeRegistry[theme].label}
        </span>
      </div>
      <RoomCanvas
        gallery={emptyPage}
        lifeUpdates={emptyPage}
        memories={{
          items: [{ type: 'post', occurredAt: post.createdAt, post }],
          nextCursor: null,
        }}
        posts={{ items: [post], nextCursor: null }}
        room={room}
      />
    </AppShell>
  );
}

const emptyPage = { items: [], nextCursor: null };

function previewRoom(themePreset: RoomThemePreset): RoomView {
  const defaults = roomThemeRegistry[themePreset].defaults;
  return {
    id: ownerId as unknown as RoomId,
    ownerUserId: ownerId,
    owner: previewUser.profile,
    visibility: 'friends',
    themePreset,
    configurationVersion: 1,
    layout: 'two_column',
    ...defaults,
    location: 'Istanbul · Berlin',
    currently:
      'Turning the last weeks of summer into a tiny handmade photo book.',
    music: {
      url: 'https://music.example/alice/summer-evening',
      title: 'Summer Evening',
      artist: 'The Paldora House Band',
    },
    bannerMediaId: null,
    bannerUrl: null,
    topFriendsSize: 4,
    topFriendsVisibility: 'visible',
    widgets: [
      'currently',
      'music',
      'top_friends',
      'photos',
      'life_updates',
      'posts',
      'memories',
    ].map((type, position) => ({
      type: type as RoomView['widgets'][number]['type'],
      placement: position < 3 ? 'sidebar' : 'main',
      position,
      enabled: true,
    })),
    topFriends: friends.slice(0, 4).map((friend, position) => ({
      userId: friend.user.id,
      username: friend.user.username ?? '',
      displayName: friend.user.displayName ?? 'Paldora friend',
      avatarUrl: friend.user.avatarUrl,
      position,
    })),
    viewerRelationship: 'owner',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-24T09:00:00.000Z',
  };
}
