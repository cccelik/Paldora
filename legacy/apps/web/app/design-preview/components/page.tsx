import type {
  Box,
  BoxId,
  BoxMember,
  Friendship,
  FriendshipId,
  MediaAssetId,
  Post,
  PostId,
  UserId,
} from '@paldora/domain';
import { notFound } from 'next/navigation';
import { BoxInvitePanel } from '../../components/box-invite-panel';
import { BoxManagementMenu } from '../../components/box-management-menu';
import { BoxMemberPanel } from '../../components/box-member-panel';
import { BoxSettingsPanel } from '../../components/box-settings-panel';
import { PostComposer } from '../../components/post-composer';
import { PostFeed } from '../../components/post-feed';

const previewOwnerId = '30000000-0000-4000-8000-000000000001' as UserId;
const previewBoxId = '20000000-0000-4000-8000-000000000001' as BoxId;
const previewBox: Box = {
  id: previewBoxId,
  name: 'Readers after dark',
  slug: 'readers-after-dark-preview',
  ownerUserId: previewOwnerId,
  privacyMode: 'private',
  status: 'active',
  currentUserRole: 'owner',
  memberCount: 4,
  createdAt: '2026-08-23T00:00:00.000Z',
  updatedAt: '2026-08-23T00:00:00.000Z',
};

const previewFriends: Friendship[] = [
  ['Maya Chen', 'maya_chen'],
  ['Noah Williams', 'noah_w'],
  ['Sofia Demir', 'sofia_d'],
  ['Elias Becker', 'elias_b'],
  ['Amara Okafor', 'amara_o'],
  ['Leo Martin', 'leo_m'],
].map(([displayName, username], index) => {
  const suffix = String(index + 1).padStart(12, '0');
  return {
    id: `00000000-0000-4000-8000-${suffix}` as FriendshipId,
    user: {
      id: `10000000-0000-4000-8000-${suffix}` as UserId,
      username: username ?? null,
      displayName: displayName ?? null,
      avatarUrl: null,
    },
    status: 'accepted',
    direction: 'established',
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  };
});

const previewMembers: BoxMember[] = [
  {
    userId: previewOwnerId,
    username: 'alice_moreno',
    displayName: 'Alice Moreno',
    avatarUrl: null,
    role: 'owner',
    status: 'active',
    joinedAt: '2026-08-23T00:00:00.000Z',
  },
  {
    userId: previewFriends[0]!.user.id,
    username: 'maya_chen',
    displayName: 'Maya Chen',
    avatarUrl: null,
    role: 'admin',
    status: 'active',
    joinedAt: '2026-08-23T00:00:00.000Z',
  },
  {
    userId: previewFriends[1]!.user.id,
    username: 'noah_w',
    displayName: 'Noah Williams',
    avatarUrl: null,
    role: 'member',
    status: 'active',
    joinedAt: '2026-08-23T00:00:00.000Z',
  },
  {
    userId: '30000000-0000-4000-8000-000000000004' as UserId,
    username: 'rina_reads',
    displayName: 'Rina Patel',
    avatarUrl: null,
    role: 'member',
    status: 'active',
    joinedAt: '2026-08-23T00:00:00.000Z',
  },
];

const previewPosts: Post[] = [
  {
    id: '40000000-0000-4000-8000-000000000001' as PostId,
    boxId: previewBoxId,
    boxName: previewBox.name,
    author: {
      userId: previewOwnerId,
      username: 'alice_moreno',
      displayName: 'Alice Moreno',
      avatarUrl: null,
    },
    content:
      'Finished our August pick tonight. The final chapter completely changed how I understood the opening scene.',
    media: [
      {
        id: '50000000-0000-4000-8000-000000000001' as MediaAssetId,
        contentType: 'image/png',
        status: 'ready',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        thumbnailUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        width: 1_200,
        height: 800,
      },
      {
        id: '50000000-0000-4000-8000-000000000002' as MediaAssetId,
        contentType: 'image/png',
        status: 'ready',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        thumbnailUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        width: 800,
        height: 1_200,
      },
    ],
    interactions: {
      commentCount: 3,
      reactions: [
        { kind: '❤️', count: 4 },
        { kind: '🙏', count: 2 },
      ],
      currentUserReaction: '❤️',
      realReactions: [],
    },
    status: 'active',
    editedAt: null,
    createdAt: '2026-08-23T12:00:00.000Z',
    updatedAt: '2026-08-23T12:00:00.000Z',
  },
  {
    id: '40000000-0000-4000-8000-000000000002' as PostId,
    boxId: previewBoxId,
    boxName: previewBox.name,
    author: {
      userId: previewFriends[0]!.user.id,
      username: 'maya_chen',
      displayName: 'Maya Chen',
      avatarUrl: null,
    },
    content: 'I left three possible books for September in the Box chat.',
    media: [],
    interactions: {
      commentCount: 0,
      reactions: [],
      currentUserReaction: null,
      realReactions: [],
    },
    status: 'active',
    editedAt: null,
    createdAt: '2026-08-22T18:30:00.000Z',
    updatedAt: '2026-08-22T18:30:00.000Z',
  },
];

export default function ComponentDesignPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="component-preview-page">
      <section className="component-preview-posts" aria-label="Post preview">
        <PostComposer boxId={previewBoxId} />
        <PostFeed
          currentUserId={previewOwnerId}
          nextCursor="preview-cursor"
          posts={previewPosts}
          returnPath="/design-preview/components"
          reactionPresets={['👍', '❤️', '😂', '😮', '😢']}
        />
      </section>
      <BoxManagementMenu>
        <BoxInvitePanel
          boxId={previewBoxId}
          friends={previewFriends}
          memberUserIds={[]}
          pendingInviteeUserIds={[previewFriends[0]!.user.id]}
        />
        <BoxMemberPanel
          boxId={previewBoxId}
          currentUserId={previewOwnerId}
          currentUserRole="owner"
          members={previewMembers}
          socialConnectionUserIds={previewFriends.map(
            (friend) => friend.user.id,
          )}
        />
        <BoxSettingsPanel box={previewBox} />
      </BoxManagementMenu>
    </main>
  );
}
