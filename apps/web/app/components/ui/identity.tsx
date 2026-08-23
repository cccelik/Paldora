import type { ReactNode } from 'react';
import { classNames } from './class-names';

export function InitialAvatar({
  name,
  imageUrl,
  className,
  length = 1,
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
  length?: 1 | 2;
}) {
  return (
    <span
      className={classNames(className ?? 'member-avatar')}
      aria-hidden="true"
    >
      {imageUrl ? <img src={imageUrl} alt="" /> : initials(name, length)}
    </span>
  );
}

export function SocialRow({
  title,
  detail,
  leading,
  actions,
}: {
  title: ReactNode;
  detail: ReactNode;
  leading: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className="social-row">
      {leading}
      <div className="social-row-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {actions && <div className="row-actions">{actions}</div>}
    </article>
  );
}

export function PersonRow({
  name,
  username,
  detail = 'Friend request',
  actions,
}: {
  name: string;
  username: string;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <SocialRow
      title={name}
      detail={
        <>
          @{username} · {detail}
        </>
      }
      leading={<InitialAvatar name={name} />}
      actions={actions}
    />
  );
}

export function initials(value: string, length: 1 | 2 = 1): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const result =
    length === 1
      ? words[0]?.slice(0, 1)
      : words
          .map((word) => word[0])
          .join('')
          .slice(0, 2);
  return result?.toUpperCase() || '?';
}
