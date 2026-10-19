'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

export function PendingSubmitButton({
  children,
  pendingChildren,
  className,
  disabled = false,
}: {
  children: ReactNode;
  pendingChildren: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      type="submit"
      disabled={disabled || pending}
      aria-live="polite"
    >
      {pending ? pendingChildren : children}
    </button>
  );
}
