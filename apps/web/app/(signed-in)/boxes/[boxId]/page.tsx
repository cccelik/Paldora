import { canManageMembers } from '@paldora/domain';
import { type Route } from 'next';
import Link from 'next/link';
import { MemberList } from '../../../components/box-members';
import {
  DeleteSection,
  InviteSection,
  LeaveSection,
  SettingsSection,
} from '../../../components/box-sections';
import { MoreLink } from '../../../components/more-link';
import { PostFeed } from '../../../components/post-card';
import { PostComposer } from '../../../components/post-composer';
import {
  BackLink,
  Badge,
  buttonClassName,
  PageHeader,
  Section,
} from '../../../components/ui';
import { BOX_ABSENT, uuidParam } from '../../../lib/route-params';
import {
  apiClient,
  completedUser,
  cursorParam,
  orNotFound,
} from '../../../lib/session';
import styles from '../../page-stack.module.css';
export const metadata = { title: 'Box' };

const roleLabel = { owner: 'Owner', admin: 'Admin', member: 'Member' } as const;
const absent = BOX_ABSENT;

export default async function BoxPage({
  params,
  searchParams,
}: PageProps<'/boxes/[boxId]'>) {
  const me = await completedUser();
  const parsedId = uuidParam((await params).boxId);
  const boxId = parsedId;
  const api = await apiClient();
  const box = await orNotFound(api.box(boxId), absent);
  const manager = canManageMembers(box.currentUserRole);
  const owner = box.currentUserRole === 'owner';
  const cursor = cursorParam((await searchParams).members);
  const postsCursor = cursorParam((await searchParams).posts);
  const [feed, members, invitations] = await Promise.all([
    orNotFound(api.boxPosts(boxId, { limit: 20, cursor: postsCursor }), absent),
    orNotFound(api.boxMembers(boxId, { limit: 25, cursor }), absent),
    manager
      ? orNotFound(api.boxInvitations(boxId, { limit: 50 }), absent)
      : Promise.resolve(null),
  ]);
  return (
    <div className={styles.stack}>
      <BackLink href="/boxes">All Boxes</BackLink>
      <PageHeader
        title={box.name}
        meta={
          <>
            <Badge tone={owner ? 'accent' : 'neutral'}>
              {roleLabel[box.currentUserRole]}
            </Badge>
            <Badge>
              {box.memberCount} {box.memberCount === 1 ? 'member' : 'members'}
            </Badge>
            {box.status === 'archived' ? <Badge>Archived</Badge> : null}
          </>
        }
        description={
          box.status === 'archived'
            ? 'This Box is archived. It stays readable, but no one new can join until the owner restores it.'
            : undefined
        }
      />
      <Section id="posts" title="Posts">
        {box.status === 'active' ? <PostComposer boxId={boxId} /> : null}
        <div className={styles.actions}>
          {box.status === 'active' ? (
            <Link
              className={buttonClassName('secondary')}
              href={`/life-updates/new?box=${boxId}` as Route}
            >
              Share a Life Update
            </Link>
          ) : null}
          <Link
            className={buttonClassName('secondary')}
            href={`/boxes/${boxId}/memories`}
          >
            Memories
          </Link>
        </div>
        <PostFeed
          items={feed.items}
          presets={me.preferences.reactionPresets}
          viewerId={me.user.id}
          empty="No posts yet. Be the first to share."
        />
        {feed.nextCursor ? (
          <MoreLink
            href={`/boxes/${boxId}?posts=${encodeURIComponent(feed.nextCursor)}`}
            label="Show older posts"
          />
        ) : null}
      </Section>
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
      {invitations ? (
        <InviteSection box={box} invitations={invitations.items} />
      ) : null}
      {owner ? <SettingsSection box={box} /> : null}
      <LeaveSection box={box} />
      {owner ? <DeleteSection box={box} /> : null}
    </div>
  );
}
