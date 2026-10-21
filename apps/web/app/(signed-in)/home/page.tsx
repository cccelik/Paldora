import Link from 'next/link';
import { MoreLink } from '../../components/more-link';
import { PostFeed } from '../../components/post-card';
import { Avatar, buttonClassName, Section } from '../../components/ui';
import { apiClient, completedUser, cursorParam } from '../../lib/session';
import pageStyles from '../page-stack.module.css';
import styles from './page.module.css';
export const metadata = { title: 'Home' };

export default async function HomePage({ searchParams }: PageProps<'/home'>) {
  const { user, profile, preferences } = await completedUser();
  const cursor = cursorParam((await searchParams).feed);
  const feed = await (await apiClient()).homeFeed({ limit: 20, cursor });
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
        <PostFeed
          items={feed.items}
          presets={preferences.reactionPresets}
          viewerId={user.id}
          showBox
          empty="Nothing here yet. Open a Box and share something, or accept an invitation."
        />
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
