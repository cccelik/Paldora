'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

export function OverflowMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="member-actions-menu" ref={container}>
      <button
        aria-expanded={open}
        aria-label={label}
        className="member-actions-trigger"
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        …
      </button>
      {open && <div className="member-actions-popover">{children}</div>}
    </div>
  );
}
