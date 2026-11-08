import { type Route } from 'next';
import Link from 'next/link';
import styles from '@/components/ui/back-link.module.css';
import { Icon } from '@/components/ui/icons';
import { type ReactNode } from 'react';
export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <p>
      <Link href={href as Route} className={styles.link}>
        <Icon name="arrowLeft" size={16} />
        {children}
      </Link>
    </p>
  );
}
