import { Chip } from '@/components/ui/chip';
import { type ReactNode } from 'react';
/** A small status or role label: a static `Chip` (default or brass). */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent';
}) {
  return <Chip kind={tone === 'accent' ? 'brass' : 'default'}>{children}</Chip>;
}
