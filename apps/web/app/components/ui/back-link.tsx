import { type Route } from 'next';
import Link from 'next/link';
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
      <Link href={href as Route}>← {children}</Link>
    </p>
  );
}
