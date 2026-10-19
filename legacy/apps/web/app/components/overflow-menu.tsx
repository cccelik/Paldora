'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function OverflowMenu({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
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
    <div
      className={`member-actions-menu${className ? ` ${className}` : ''}`}
      ref={container}
    >
      <button
        aria-expanded={open}
        aria-label={label}
        className="member-actions-trigger"
        ref={trigger}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <svg aria-hidden="true" viewBox="0 0 18 6">
          <circle cx="3" cy="3" r="1.5" />
          <circle cx="9" cy="3" r="1.5" />
          <circle cx="15" cy="3" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          className="member-actions-popover"
          onClick={(event) => {
            const button = (event.target as Element).closest('button');
            if (button?.type === 'button') setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
