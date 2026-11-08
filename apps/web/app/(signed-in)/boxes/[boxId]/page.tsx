import styles from '@/(signed-in)/boxes/[boxId]/page.module.css';
import { MemberList } from '@/components/boxes/box-members';
import {
  DeleteSection,
  InviteSection,
  LeaveSection,
  SettingsSection,
} from '@/components/boxes/box-sections';
import { MoreLink } from '@/components/common/more-link';

import { FirebaseBoxFeed } from '@/components/posts/firebase-box-feed';
import { PostComposer } from '@/components/posts/post-composer';
import { BoxHero } from '@/components/boxes/box-hero';
import {
  BackLink,
  buttonClassName,
  Chip,
  EmptyState,
  PageColumns,
  Section,
} from '@/components/ui';
import { BOX_ABSENT, uuidParam } from '@/lib/server/route-params';
import { completedUser, cursorParam, orNotFound } from '@/lib/server/session';
import {
  firebaseWebData,
  type FirebaseFeedItem,
} from '@/lib/server/firebase/data';
import type { BoxView, CurrentUser } from '@paldora/validation';
import { canManageMembers } from '@paldora/domain';
import { type Route } from 'next';
import Link from 'next/link';
export const metadata = { title: 'Box' };

const roleLabel = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;
const absent = BOX_ABSENT;

function BoxPosts({
  boxId,
  status,
  firebaseFeed,
  me,
}: {
  boxId: string;
  status: BoxView['status'];
  firebaseFeed: { items: FirebaseFeedItem[]; nextCursor: string | null };
  me: CurrentUser;
}) {
  return (
    <section id="posts" className={styles.posts} aria-label="Posts">
      {status === 'active' ? <PostComposer boxId={boxId} /> : null}
      <div className={styles.actions}>
        {status === 'active' ? (
          <Link
            className={buttonClassName('secondary')}
            href={`/life-updates/new?box=${boxId}` as Route}
          >
            Share a Life Update
          </Link>
        ) : null}
      </div>
      {
        <FirebaseBoxFeed
          items={firebaseFeed.items}
          active={status === 'active'}
          presets={me.preferences.reactionPresets}
        />
      }
      {firebaseFeed.nextCursor ? (
        <MoreLink
          href={`/boxes/${boxId}?posts=${encodeURIComponent(firebaseFeed.nextCursor)}`}
          label="Show older posts"
        />
      ) : null}
    </section>
  );
}

export default async function BoxPage({
  params,
  searchParams,
}: PageProps<'/boxes/[boxId]'>) {
  const me = await completedUser();
  const parsedId = uuidParam((await params).boxId);
  const boxId = parsedId;
  const api = await firebaseWebData();
  const box = await orNotFound(api.box(boxId), absent);
  const manager = canManageMembers(box.currentUserRole);
  const owner = box.currentUserRole === 'owner';
  const cursor = cursorParam((await searchParams).members);
  const postsCursor = cursorParam((await searchParams).posts);
  const [members, invitations, firebaseFeed] = await Promise.all([
    orNotFound(api.boxMembers(boxId, { limit: 25, cursor }), absent),
    manager
      ? orNotFound(api.boxInvitations(boxId, { limit: 50 }), absent)
      : Promise.resolve(null),
    orNotFound(
      api.boxPosts(boxId, {
        limit: 20,
        cursor: postsCursor,
      }),
      absent,
    ),
  ]);
  return (
    <div className={styles.page}>
      <BackLink href="/boxes">All Boxes</BackLink>
      <BoxHero
        box={box}
        members={members.items}
        canInvite={manager}
        roleLabel={roleLabel[box.currentUserRole]}
      />
      {box.status === 'archived' ? (
        <EmptyState>
          This Box is archived. It stays readable, but no one new can join until
          the owner restores it.
        </EmptyState>
      ) : null}
      <PageColumns
        railLabel="Members"
        rail={
          <>
            <Section id="members" title="Members">
              <MemberList
                boxId={boxId}
                viewerId={me.user.id}
                viewerRole={box.currentUserRole}
                members={members.items}
              />
              {members.nextCursor ? (
                <MoreLink
                  href={`/boxes/${boxId}?members=${encodeURIComponent(members.nextCursor)}`}
                  label="Show more members"
                />
              ) : null}
            </Section>
          </>
        }
      >
        <nav aria-label="This Box" className={styles.tabs}>
          <Chip kind="selected">Moments</Chip>
          <Link className={styles.tab} href="#members">
            Members
          </Link>
          <Link className={styles.tab} href={`/boxes/${boxId}/memories`}>
            Memories
          </Link>
        </nav>
        <BoxPosts
          boxId={boxId}
          status={box.status}
          firebaseFeed={firebaseFeed}
          me={me}
        />
      </PageColumns>
      <div className={styles.manage}>
        {invitations ? (
          <InviteSection box={box} invitations={invitations.items} />
        ) : null}
        {owner ? <SettingsSection box={box} /> : null}
        <LeaveSection box={box} />
        {owner ? <DeleteSection box={box} /> : null}
      </div>
    </div>
  );
}
