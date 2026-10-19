import type {
  Box,
  BoxId,
  CurrentUser,
  LifeUpdate,
  LifeUpdateId,
  PostId,
  UserId,
} from '@paldora/domain';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { LifeUpdateCard } from '../../components/life-update-card';
import { LifeUpdateComposer } from '../../components/life-update-composer';
import { LifeUpdateEditor } from '../../components/life-update-editor';
import { MemoryTimeline } from '../../components/memory-timeline';
import { PageHeader } from '../../components/ui';

const ownerId = '10000000-0000-4000-8000-000000000001' as UserId;
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
    bio: 'Making room for the longer stories.',
    avatarUrl: null,
    reactionPresets: ['👍', '❤️', '😂', '😮', '🙏'],
    onboardingState: 'complete',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
};

const previewBoxes: Box[] = [
  'Readers after dark',
  'Berlin weekends',
  'Pottery people',
  'University friends',
  'Family circle',
  'Travel plans',
].map((name, index) => ({
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as BoxId,
  name,
  slug: `preview-${index + 1}`,
  ownerUserId: ownerId,
  privacyMode: 'private',
  status: 'active',
  currentUserRole: 'owner',
  memberCount: index + 3,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}));

const previewUpdate: LifeUpdate = {
  id: '30000000-0000-4000-8000-000000000001' as LifeUpdateId,
  author: {
    userId: ownerId,
    username: 'alice_moreno',
    displayName: 'Alice Moreno',
    avatarUrl: null,
  },
  sections: {
    lifeLately:
      'August has felt slower in the best way: late dinners, long walks, and more time with the people I missed.',
    workOrUniversity:
      'The research proposal is finally taking shape. I am learning to leave the rough edges visible for longer.',
    currentlyInto: 'Wheel-thrown mugs, tiny photo books, and peach iced tea.',
    whatsNext: 'A quiet weekend by the water before the semester begins.',
  },
  media: [],
  contexts: [
    {
      postId: '40000000-0000-4000-8000-000000000001' as PostId,
      audience: 'box',
      boxId: previewBoxes[1]!.id,
      boxName: previewBoxes[1]!.name,
      interactions: {
        commentCount: 2,
        reactions: [{ kind: '❤️', count: 3 }],
        currentUserReaction: null,
        realReactions: [],
      },
    },
    {
      postId: '40000000-0000-4000-8000-000000000002' as PostId,
      audience: 'box',
      boxId: previewBoxes[0]!.id,
      boxName: previewBoxes[0]!.name,
      interactions: {
        commentCount: 5,
        reactions: [{ kind: '🙏', count: 4 }],
        currentUserReaction: null,
        realReactions: [],
      },
    },
  ],
  createdAt: '2026-08-18T19:30:00.000Z',
  updatedAt: '2026-08-18T19:30:00.000Z',
};

export default async function PhaseSixDesignPreview({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { screen } = await searchParams;
  if (screen === 'composer') {
    return (
      <AppShell active="life-updates" current={previewUser}>
        <PageHeader
          description="Choose several Boxes for the same update. Each Box gets its own conversation."
          eyebrow="Share once, keep every circle private"
          title="New Life Update"
        />
        <LifeUpdateComposer boxes={previewBoxes} />
      </AppShell>
    );
  }
  if (screen === 'memories') {
    return (
      <AppShell active="memories" current={previewUser}>
        <PageHeader
          description="Browse the stories and photos you can still see, organized by year."
          eyebrow="Your private archive"
          title="Memories"
        />
        <section className="memory-years">
          {[2026, 2025, 2024].map((year, index) => (
            <Link className="memory-year-card" href="#" key={year}>
              <strong>{year}</strong>
              <span>{12 - index * 3} memories</span>
            </Link>
          ))}
        </section>
      </AppShell>
    );
  }
  if (screen === 'month') {
    return (
      <AppShell active="memories" current={previewUser}>
        <PageHeader
          description="Only content you can currently access appears here."
          eyebrow="Your memory archive"
          title="August 2026"
        />
        <MemoryTimeline
          currentUserId={ownerId}
          items={[
            {
              type: 'life_update',
              occurredAt: previewUpdate.createdAt,
              lifeUpdate: previewUpdate,
            },
          ]}
          reactionPresets={previewUser.profile.reactionPresets}
          returnPath="/design-preview/phase-6?screen=month"
        />
      </AppShell>
    );
  }
  if (screen === 'edit') {
    return (
      <AppShell active="life-updates" current={previewUser}>
        <PageHeader
          description="The audience stays locked while the shared story and photos remain editable."
          eyebrow="Keep every delivery in sync"
          title="Edit Life Update"
        />
        <LifeUpdateEditor update={previewUpdate} />
      </AppShell>
    );
  }

  const pageCopy =
    screen === 'detail'
      ? {
          description:
            'The shared story, with the private conversation for the selected Box.',
          eyebrow: 'August 18, 2026',
          title: 'Life Update',
        }
      : screen === 'history'
        ? {
            description:
              'Life Updates Alice has shared through Boxes you can still access.',
            eyebrow: '@alice_moreno',
            title: "Alice's Life Updates",
          }
        : screen === 'box'
          ? {
              description:
                'Longer stories shared with Readers after dark, with this Box’s private conversations.',
              eyebrow: 'Readers after dark',
              title: 'Box Life Updates',
            }
          : {
              description:
                'Shared once, with a separate private conversation in every Box.',
              eyebrow: 'The longer story',
              title: 'Life Updates',
            };

  return (
    <AppShell active="life-updates" current={previewUser}>
      <PageHeader
        description={pageCopy.description}
        eyebrow={pageCopy.eyebrow}
        title={pageCopy.title}
      />
      <LifeUpdateCard
        currentUserId={ownerId}
        reactionPresets={previewUser.profile.reactionPresets}
        returnPath="/design-preview/phase-6"
        update={previewUpdate}
      />
    </AppShell>
  );
}
