'use client';

import { Button, type ButtonVariant } from '@/components/ui';
import { useFormStatus } from 'react-dom';
/** A submit button that disables itself and says so while its form runs. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  block = false,
  disabled = false,
  describedBy,
}: {
  children: string;
  pendingLabel: string;
  variant?: ButtonVariant;
  block?: boolean;
  /** Locked until the form is ready, independent of its pending state. */
  disabled?: boolean;
  /** IDs of text that explains the button (a notice, why it is locked). */
  describedBy?: string | undefined;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      block={block}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      aria-describedby={describedBy}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
