import pageStyles from '@/(signed-in)/home/page-layout.module.css';
import styles from '@/(signed-in)/home/page.module.css';
import { MoreLink } from '@/components/common/more-link';

import { FirebaseBoxFeed } from '@/components/posts/firebase-box-feed';
import { Avatar, buttonClassName, Section } from '@/components/ui';
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
  const feed = await (await firebaseWebData()).homeFeed({ limit: 20, cursor });
  return (
    <div className={pageStyles.stack}>
      <section className={styles.welcome} aria-labelledby="welcome-title">
        <Avatar
          url={profile.avatar?.url}
          name={profile.displayName}
          size="large"
        />
        <div className={styles.text}>
          <p className={styles.eyebrow}>@{profile.username}</p>
          <h1 id="welcome-title" className={styles.title}>
            Welcome, {profile.displayName}.
          </h1>
          {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
        </div>
      </section>
      <Section
        id="feed"
        title="Your feed"
        description="Posts from your Boxes, newest first. No ranking, ever."
      >
        <div className={pageStyles.actions}>
          <Link
            className={buttonClassName('secondary')}
            href="/life-updates/new"
          >
            New Life Update
          </Link>
          <Link className={buttonClassName('quiet')} href="/memories">
            Memories
          </Link>
        </div>
        {
          <FirebaseBoxFeed
            items={feed.items as FirebaseFeedItem[]}
            active
            presets={preferences.reactionPresets}
            showBox
            empty="Nothing here yet. Open a Box and share something, or accept an invitation."
          />
        }
        {feed.nextCursor ? (
          <MoreLink
            href={`/home?feed=${encodeURIComponent(feed.nextCursor)}`}
            label="Show older posts"
          />
        ) : null}
      </Section>
    </div>
  );
}
