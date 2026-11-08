import styles from '@/components/boxes/box-hero.module.css';
import { AvatarStack, buttonClassName, Chip, Icon } from '@/components/ui';
import { type BoxMemberView, type BoxView } from '@paldora/validation';
import Link from 'next/link';

/**
 * The Box header (Figma W06): an inverse hero with the Box name, its real
 * member count and role, the first members, and Invite for those who may.
 * There is no cover photo to show, so none is drawn.
 */
export function BoxHero({
  box,
  members,
  canInvite,
  roleLabel,
}: {
  box: BoxView;
  members: readonly BoxMemberView[];
  canInvite: boolean;
  roleLabel: string;
}) {
  return (
    <header className={styles.hero}>
      <div className={styles.text}>
        <p className={styles.eyebrow}>
          <Icon name="lock" size={14} />
          Private Box
        </p>
        <h1 className={styles.title}>{box.name}</h1>
        <p className={styles.meta}>
          {box.memberCount} {box.memberCount === 1 ? 'member' : 'members'} ·{' '}
          {roleLabel}
        </p>
        {box.status === 'archived' ? (
          <p>
            <Chip kind="soft">Archived</Chip>
          </p>
        ) : null}
      </div>
      <div className={styles.side}>
        <AvatarStack
          people={members.slice(0, 3).map((member) => ({
            id: member.user.id,
            name: member.user.displayName,
            url: member.user.avatarUrl ?? null,
          }))}
        />
        {canInvite && box.status === 'active' ? (
          <Link className={buttonClassName('secondary')} href="#invite">
            <Icon name="plus" size={16} />
            Invite
          </Link>
        ) : null}
      </div>
    </header>
  );
}
