import styles from '@/(signed-in)/settings/reactions/page.module.css';
import { ReactionPresetEditor } from '@/components/interactions/reaction-preset-editor';
import { completedUser } from '@/lib/server/session';
export const metadata = { title: 'Reactions' };

export default async function ReactionSettingsPage() {
  const user = await completedUser();
  return (
    <section className={styles.section} aria-labelledby="reactions-title">
      <h2 id="reactions-title" className={styles.sectionTitle}>
        Reaction shortcuts
      </h2>
      <p className={styles.sectionDetail}>
        These five appear first in every reaction bar. They are shortcuts only:
        you can always react with any emoji through More.
      </p>
      <ReactionPresetEditor current={user.preferences.reactionPresets} />
    </section>
  );
}
