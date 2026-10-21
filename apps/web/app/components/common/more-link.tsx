import { buttonClassName } from '@/components/ui';
import { type Route } from 'next';
import Link from 'next/link';
/** "Show more" for a keyset-paged list: a plain link, so it needs no script. */
/** `href` carries a query string, which typed routes cannot check statically. */
export function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <div>
      <Link className={buttonClassName('secondary')} href={href as Route}>
        {label}
      </Link>
    </div>
  );
}
