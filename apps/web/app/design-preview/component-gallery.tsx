import { Banner, Toast } from '@/components/ui';
import {
  AvatarBlock,
  CardBlocks,
  ListBlock,
  NavigationBlocks,
  ThreadBlocks,
} from '@/design-preview/gallery-content';
import { Block } from '@/design-preview/gallery-block';
import styles from '@/design-preview/gallery.module.css';
import { ButtonBlocks, FieldBlocks } from '@/design-preview/gallery-inputs';
import { OverlayDemo } from '@/design-preview/overlay-demo';
/** Every Figma component of page "02 Components"; `scope` keeps ids unique per panel. */
export function ComponentGallery({ scope }: { scope: string }) {
  return (
    <>
      <ButtonBlocks />
      <FieldBlocks scope={scope} />
      <AvatarBlock />
      <ListBlock scope={scope} />
      <Block title="Banner" node="43:280">
        <div className={styles.stack}>
          <Banner tone="info" title="Good to know">
            Unblocking does not restore a friendship.
          </Banner>
          <Banner tone="success" title="Saved">
            Your Room is up to date.
          </Banner>
          <Banner tone="warning" title="This Box is archived">
            Nobody can post or comment.
          </Banner>
          <Banner tone="danger" title="Photo failed">
            One photo could not be processed.
          </Banner>
        </div>
      </Block>
      <Block title="Toast" node="43:296">
        <div className={styles.stack}>
          <Toast action={<a href="#main">View</a>}>
            Moment shared with Sunday Supper.
          </Toast>
          <Toast tone="failure">Could not send. Try again.</Toast>
          <Toast
            kind="notification"
            title="Leah reacted to your photo"
            subtitle="Sunday Supper · now"
          />
        </div>
      </Block>
      <CardBlocks />
      <ThreadBlocks />
      <NavigationBlocks scope={scope} />
      <Block title="Overlays" node="44:247">
        <OverlayDemo />
      </Block>
    </>
  );
}
