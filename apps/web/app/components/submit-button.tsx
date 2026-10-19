'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonVariant } from './ui';

/** A submit button that disables itself and says so while its form runs. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  block = false,
  disabled = false,
}: {
  children: string;
  pendingLabel: string;
  variant?: ButtonVariant;
  block?: boolean;
  /** Locked until the form is ready, independent of its pending state. */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      block={block}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
