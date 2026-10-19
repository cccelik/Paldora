'use client';

import type { ReactionKind, ReactionPresets } from '@paldora/domain';
import { useState, type ReactNode } from 'react';
import { EmojiChooser } from './emoji-chooser';

export function EmojiReactionPicker({
  currentReaction,
  label,
  pending,
  presets,
  triggerContent,
  onCamera,
  onReaction,
}: {
  currentReaction: ReactionKind | null;
  label: string;
  pending: boolean;
  presets: ReactionPresets;
  triggerContent?: ReactNode;
  onCamera?: (() => void) | undefined;
  onReaction: (kind: ReactionKind | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [allEmojiOpen, setAllEmojiOpen] = useState(false);
  const choose = (emoji: string) => {
    onReaction(currentReaction === emoji ? null : emoji);
    setOpen(false);
    setAllEmojiOpen(false);
  };
  return (
    <div className="reaction-picker-wrap">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        aria-pressed={Boolean(currentReaction)}
        className={currentReaction ? 'selected' : undefined}
        disabled={pending}
        onClick={() => {
          setOpen((current) => !current);
          if (open) setAllEmojiOpen(false);
        }}
        type="button"
      >
        {triggerContent ?? (
          <>
            <span aria-hidden="true">☺</span>
            React
          </>
        )}
      </button>
      {open && (
        <div className="reaction-picker" role="menu">
          {presets.map((emoji, index) => (
            <button
              aria-checked={currentReaction === emoji}
              aria-label={`React with ${emoji}`}
              disabled={pending}
              key={`${index}-${emoji}`}
              onClick={() => choose(emoji)}
              role="menuitemradio"
              type="button"
            >
              {emoji}
            </button>
          ))}
          <button
            aria-expanded={allEmojiOpen}
            aria-label="Choose any emoji"
            onClick={() => setAllEmojiOpen((current) => !current)}
            role="menuitem"
            type="button"
          >
            +
          </button>
          {onCamera && (
            <button
              aria-label="Take a camera reaction"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                onCamera();
              }}
              role="menuitem"
              type="button"
            >
              📷
            </button>
          )}
          {allEmojiOpen && (
            <div className="reaction-any-emoji">
              <EmojiChooser
                selected={
                  currentReaction === 'real'
                    ? undefined
                    : (currentReaction ?? undefined)
                }
                onChoose={choose}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
