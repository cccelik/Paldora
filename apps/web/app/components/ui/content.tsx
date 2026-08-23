import type { ReactNode } from 'react';
import { classNames } from './class-names';

export function SurfaceCard({
  title,
  children,
  as: Element = 'section',
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  as?: 'aside' | 'section';
  className?: string;
}) {
  return (
    <Element className={classNames('settings-card', className)}>
      {title && <h2>{title}</h2>}
      {children}
    </Element>
  );
}

export function SectionHeading({
  title,
  count,
}: {
  title: ReactNode;
  count?: number;
}) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {count !== undefined && <span>{count}</span>}
    </div>
  );
}

export function EmptyState({
  eyebrow,
  title,
  description,
  actions,
  symbol = '□',
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  symbol?: ReactNode;
  className?: string;
}) {
  return (
    <section className={classNames('empty-home', className)}>
      <div className="empty-box-art" aria-hidden="true">
        <span>✦</span>
        <div>{symbol}</div>
      </div>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
      {actions}
    </section>
  );
}

export function ListEmpty({
  title,
  description,
}: {
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <div className="list-empty">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}
