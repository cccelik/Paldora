'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonVariant } from './ui';

/** A submit button that disables itself and says so while its form runs. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  block = false,
}: {
  children: string;
  pendingLabel: string;
  variant?: ButtonVariant;
  block?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      block={block}
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
