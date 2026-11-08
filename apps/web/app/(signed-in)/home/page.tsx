import { BoxRail } from '@/components/boxes/box-rail';
import { MoreLink } from '@/components/common/more-link';
import { FirebaseBoxFeed } from '@/components/posts/firebase-box-feed';
import { buttonClassName, PageColumns, PageHeader } from '@/components/ui';
import { completedUser, cursorParam } from '@/lib/server/session';

import {
  firebaseWebData,
  type FirebaseFeedItem,
} from '@/lib/server/firebase/data';

import Link from 'next/link';
export const metadata = { title: 'Home' };

export default async function HomePage({ searchParams }: PageProps<'/home'>) {
  const { profile, preferences } = await completedUser();
  const cursor = cursorParam((await searchParams).feed);
  const data = await firebaseWebData();
  const [feed, boxes] = await Promise.all([
    data.homeFeed({ limit: 20, cursor }),
    data.boxes({ limit: 50 }),
  ]);
  const boxNames = new Map(boxes.items.map((box) => [box.id, box.name]));
  return (
    <PageColumns
      railLabel="Your Boxes"
      rail={<BoxRail boxes={boxes.items.slice(0, 6)} />}
    >
      <PageHeader
        eyebrow={`@${profile.username}`}
        title="Welcome back,"
        accent={`${profile.displayName ?? profile.username}.`}
        description="Posts from your Boxes, newest first. No ranking, ever."
        action={
          <>
            <Link className={buttonClassName('secondary')} href="/life-updates">
              Your Life Updates
            </Link>
            <Link className={buttonClassName('quiet')} href="/memories">
              Memories
            </Link>
          </>
        }
      />
      <section id="feed" aria-label="Your feed">
        <FirebaseBoxFeed
          items={feed.items as FirebaseFeedItem[]}
          active
          presets={preferences.reactionPresets}
          boxNames={boxNames}
          empty="Nothing here yet. Open a Box and share something, or accept an invitation."
        />
        {feed.nextCursor ? (
          <MoreLink
            href={`/home?feed=${encodeURIComponent(feed.nextCursor)}`}
            label="Show older posts"
          />
        ) : null}
      </section>
    </PageColumns>
  );
}
