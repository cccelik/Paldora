import type { ReactNode } from 'react';
import { classNames } from './class-names';

export function PageHeader({
  eyebrow,
  title,
  description,
  trailing,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <header className={classNames('app-page-header', className)}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {trailing}
    </header>
  );
}
