import { Icon, type IconName } from '@/components/ui/icons';
import styles from '@/components/ui/toast.module.css';
import { type ReactNode } from 'react';
type ToastTone = 'info' | 'success' | 'attention' | 'failure';

const toneIcon: Record<ToastTone, IconName> = {
  info: 'info',
  success: 'check',
  attention: 'info',
  failure: 'alert',
};

/**
 * Figma "Toast" (43:296), presentational only; `ToastProvider` places and
 * times it. Action: inverse, for the viewer's own actions, with an optional
 * action link and a dismiss slot. Notification: surface, for activity, with
 * an avatar. The host owns the live region.
 */
export function Toast(
  props:
    | {
        kind?: 'action';
        tone?: ToastTone;
        children: ReactNode;
        /** A link or button, drawn in the toast's action style. */
        action?: ReactNode;
        dismiss?: ReactNode;
      }
    | {
        kind: 'notification';
        title: ReactNode;
        subtitle: ReactNode;
        avatar?: ReactNode;
      },
) {
  if (props.kind === 'notification') {
    return (
      <div className={`${styles.toast} ${styles.notification}`}>
        {props.avatar}
        <div className={styles.lines}>
          <p className={styles.title}>{props.title}</p>
          <p className={styles.subtitle}>{props.subtitle}</p>
        </div>
      </div>
    );
  }
  const tone = props.tone ?? 'success';
  return (
    <div className={`${styles.toast} ${styles.action}`} data-tone={tone}>
      <Icon name={toneIcon[tone]} size={18} />
      <p className={styles.message}>
        {props.children}
        {props.action ? (
          <>
            {' '}
            <span className={styles.actionSlot}>{props.action}</span>
          </>
        ) : null}
      </p>
      {props.dismiss}
    </div>
  );
}
