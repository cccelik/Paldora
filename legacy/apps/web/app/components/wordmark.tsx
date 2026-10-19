import Link from 'next/link';

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      className={compact ? 'wordmark wordmark-compact' : 'wordmark'}
      href="/"
    >
      Paldora<span aria-hidden="true">✦</span>
    </Link>
  );
}
