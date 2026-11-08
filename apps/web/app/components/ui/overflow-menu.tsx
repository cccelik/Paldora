'use client';

import { IconButton } from '@/components/ui/icon-button';
import { Icon } from '@/components/ui/icons';
import styles from '@/components/ui/overflow-menu.module.css';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
export interface OverflowMenuItem {
  key: string;
  label: string;
  /** Runs after the menu has closed and focus is back on the trigger. */
  onSelect: () => void;
  destructive?: boolean;
}

/**
 * Figma "Post card" overflow affordance (44:55): a plain "more" icon button
 * that opens a small menu. A menu button pattern: Enter/Space/ArrowDown open
 * it on the first item, arrows/Home/End move, Escape or Tab closes, a press
 * outside closes, and focus returns to the trigger.
 */
export function OverflowMenu({
  label,
  items,
  tone = 'default',
  triggerRef,
}: {
  /** Names the trigger, for example "Post options". */
  label: string;
  items: readonly OverflowMenuItem[];
  /** `inverse` for a trigger drawn on `bg/inverse`. */
  tone?: 'default' | 'inverse';
  /** Lets an owner return focus here after a dialog the item opened. */
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const own = useRef<HTMLButtonElement>(null);
  const trigger = triggerRef ?? own;
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const itemButtons = useCallback(
    () =>
      Array.from(
        root.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]',
        ) ?? [],
      ),
    [],
  );

  useEffect(() => {
    if (open) itemButtons()[0]?.focus();
  }, [open, itemButtons]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  if (items.length === 0) return null;

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = itemButtons();
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const move = (index: number) => {
      event.preventDefault();
      buttons[(index + buttons.length) % buttons.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(buttons.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') setOpen(false);
  };

  return (
    <div
      ref={root}
      className={[styles.root, tone === 'inverse' ? styles.inverse : '']
        .filter(Boolean)
        .join(' ')}
    >
      <IconButton
        ref={trigger}
        label={label}
        kind="plain"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="more" size={20} />
      </IconButton>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={styles.menu}
          onKeyDown={onMenuKey}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={[styles.item, item.destructive && styles.destructive]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
