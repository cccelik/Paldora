import {
  Avatar,
  AvatarStack,
  BoxCard,
  Button,
  Comment,
  Icon,
  IconButton,
  LifeUpdateCard,
  ListGroup,
  ListRow,
  NavBar,
  NotificationRow,
  PostCard,
  PostSkeleton,
  UploadTile,
} from '@/components/ui';
import { Sidebar } from '@/components/shell/sidebar';
import { Block } from '@/design-preview/gallery-block';
import styles from '@/design-preview/gallery.module.css';
const photo = <span className={styles.photo} aria-hidden="true" />;
const people = [
  { id: '1', name: 'Jonah Weiss' },
  { id: '2', name: 'Mara Lind' },
  { id: '3', name: 'Leah Hartmann' },
  { id: '4', name: 'Sam Ortiz' },
];
const menu = (
  <IconButton label="Post options" kind="plain">
    <Icon name="more" size={20} />
  </IconButton>
);

export function AvatarBlock() {
  return (
    <Block title="Avatar" node="43:245">
      <div className={styles.row}>
        {(['s', 'm', 'l', 'xl'] as const).map((size) => (
          <Avatar key={size} url={null} name="Leah Hartmann" size={size} />
        ))}
        <Avatar url={null} name="Alice Moreau" size="l" ring />
        <AvatarStack people={people} />
      </div>
    </Block>
  );
}

export function ListBlock({ scope }: { scope: string }) {
  return (
    <Block title="List row" node="43:347">
      <div className={styles.stack}>
        <ListGroup label="Settings">
          <ListRow
            title="Edit profile"
            icon="user"
            kind="link"
            href="/design-preview"
          />
          <ListRow
            title="Appearance"
            icon="edit"
            value="System"
            kind="button"
          />
          <ListRow
            title="Reaction alerts"
            subtitle="Tell me when someone reacts"
            icon="bell"
            kind="toggle"
            control={{ name: `${scope}-row-toggle`, defaultChecked: true }}
          />
          <ListRow
            title="Friends only"
            kind="radio"
            control={{ name: `${scope}-row-radio`, defaultChecked: true }}
          />
          <ListRow
            title="Delete account"
            icon="close"
            kind="button"
            destructive
          />
        </ListGroup>
      </div>
    </Block>
  );
}

export function CardBlocks() {
  return (
    <>
      <Block title="Post card" node="44:55">
        <div className={styles.cards}>
          <PostCard
            author={{ name: 'Leah Hartmann' }}
            meta="Sunday Supper · 2h"
            menu={menu}
            media={photo}
            likes={12}
            liked
            comments={4}
          >
            Third Sunday in a row. Same table, new soup.
          </PostCard>
          <PostCard
            author={{ name: 'Leah Hartmann' }}
            meta="Sunday Supper · 2h"
            menu={menu}
            likes={12}
            comments={4}
          >
            Who is taking the leftover soup? I have containers and no shame.
          </PostCard>
        </div>
      </Block>
      <Block title="Life Update card" node="44:74">
        <div className={styles.cards}>
          <LifeUpdateCard
            title="Jonah moved to Berlin."
            when="Yesterday"
            thumbnail={photo}
            quote="New flat, old couch. Come visit."
            action={
              <Button variant="accent" size="l">
                <Icon name="heart" size={18} />
                Send a warm note
              </Button>
            }
          />
        </div>
      </Block>
      <Block title="Box card" node="44:93">
        <div className={styles.cards}>
          <BoxCard
            name="Sunday Supper"
            meta="11 members · weekly"
            cover={photo}
            members={people}
            unread={3}
          />
          <BoxCard
            name="Book Club"
            meta="6 members"
            cover={photo}
            dot="sage"
            members={people.slice(0, 2)}
          />
        </div>
      </Block>
    </>
  );
}

export function ThreadBlocks() {
  return (
    <>
      <Block title="Comment" node="44:122">
        <div className={styles.stack}>
          <Comment author={{ name: 'Mara Lind' }} when="1h">
            Save me a bowl.
          </Comment>
          <Comment author={{ name: 'Leah Hartmann' }} when="45m" reply>
            Already set aside.
          </Comment>
          <Comment author={{ name: 'Sam Ortiz' }} when="20m" deleted>
            {null}
          </Comment>
        </div>
      </Block>
      <Block title="Notification row" node="44:140">
        <div className={styles.stack}>
          <NotificationRow
            avatar={<Avatar url={null} name="Leah Hartmann" />}
            time="Sunday Supper · now"
            unread
          >
            Leah reacted to your photo
          </NotificationRow>
          <NotificationRow
            avatar={<Avatar url={null} name="Mara Lind" />}
            time="Yesterday"
          >
            Mara commented on your post
          </NotificationRow>
        </div>
      </Block>
      <Block title="Upload tile" node="44:166">
        <div className={styles.tiles}>
          <UploadTile state="done" thumbnail={photo} />
          <UploadTile state="uploading" progress={0.42} thumbnail={photo} />
          <UploadTile state="processing" thumbnail={photo} />
          <UploadTile state="failed" thumbnail={photo} />
          <UploadTile state="add" />
        </div>
      </Block>
    </>
  );
}

export function NavigationBlocks({ scope }: { scope: string }) {
  return (
    <>
      <Block title="Nav bar" node="44:200">
        <div className={styles.stack}>
          <NavBar title="Sunday Supper" back={{ href: '/design-preview' }} />
          <NavBar
            title="New post"
            close={{ href: '/design-preview' }}
            action={menu}
          />
        </div>
      </Block>
      <Block title="Skeleton" node="44:212">
        <div className={styles.stack}>
          <PostSkeleton />
        </div>
      </Block>
      <Block title="Web sidebar" node="26:371">
        <div className={styles.sidebarFrame}>
          <Sidebar
            navLabel={`Primary (${scope} preview)`}
            currentHref="/boxes"
            composeHref="/life-updates/new"
            profile={{ name: 'Alice Moreau', handle: 'alice.moreau' }}
            items={[
              { href: '/home', label: 'Home', icon: 'home' },
              { href: '/boxes', label: 'Boxes', icon: 'box' },
              { href: '/rooms', label: 'My Room', icon: 'room' },
              { href: '/memories', label: 'Memories', icon: 'book' },
              {
                href: '/notifications',
                label: 'Activity',
                icon: 'bell',
                count: 3,
              },
              { href: '/friends', label: 'Friends', icon: 'friends' },
              { href: '/settings', label: 'Settings', icon: 'gear' },
            ]}
          />
        </div>
      </Block>
    </>
  );
}
