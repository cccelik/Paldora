import { buttonClassName, StatusPanel } from '@/components/ui';
import Link from 'next/link';
export const metadata = { title: 'Not found' };

/**
 * The shared "missing or not yours" state, kept inside the app shell. Missing,
 * deleted, blocked and not-shared-with-you all render this same page.
 */
export default function SignedInNotFound() {
  return (
    <StatusPanel
      title="This page isn’t here."
      action={
        <Link className={buttonClassName('primary')} href="/home">
          Back to Home
        </Link>
      }
    >
      It may have moved, or it may belong to a Box you’re not part of.
    </StatusPanel>
  );
}
