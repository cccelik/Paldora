import styles from '@/components/ui/banner.module.css';
import { Icon, type IconName } from '@/components/ui/icons';
import { type ReactNode } from 'react';
/** Figma "Banner" (43:280): Info, Success, Warning, Danger. */
export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const icons: Record<BannerTone, IconName> = {
  info: 'info',
  success: 'check',
  warning: 'info',
  danger: 'alert',
};

/** Spoken before the text so the tone never relies on colour alone. */
const spoken: Record<BannerTone, string | null> = {
  info: null,
  success: 'Success',
  warning: 'Warning',
  danger: 'Error',
};

/**
 * An inline notice. It is not a live region by itself; wrap it in one
 * (`FormMessage` does) when it appears after an action.
 */
export function Banner({
  tone = 'info',
  title,
  children,
}: {
  tone?: BannerTone;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`${styles.banner} ${styles[tone]}`}>
      <span className={styles.icon}>
        <Icon name={icons[tone]} size={18} />
      </span>
      <div className={styles.text}>
        <p className={styles.title}>
          {spoken[tone] ? (
            <span className="visually-hidden">{spoken[tone]}: </span>
          ) : null}
          {title}
        </p>
        {children ? <p className={styles.message}>{children}</p> : null}
      </div>
    </div>
  );
}
