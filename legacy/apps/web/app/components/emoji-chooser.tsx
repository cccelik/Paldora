'use client';

import { isSingleEmoji } from '@paldora/domain';
import { useState } from 'react';

const EMOJI_CATALOG = [
  '👍',
  '👎',
  '❤️',
  '🧡',
  '💜',
  '💙',
  '💚',
  '💛',
  '😂',
  '🤣',
  '😍',
  '🥰',
  '😘',
  '🤩',
  '😮',
  '🤯',
  '😢',
  '😭',
  '😡',
  '🥹',
  '🤔',
  '🫡️',
  '🤗',
  '🙏',
  '👏',
  '💪',
  '🤝',
  '🫶',
  '🔥',
  '✨',
  '🎉',
  '💯',
  '🌟',
  '⚡',
  '💥',
  '👀',
  '🫠',
  '💀',
  '🚀',
] as const;

export function EmojiChooser({
  selected,
  onChoose,
}: {
  selected?: string | undefined;
  onChoose: (emoji: string) => void;
}) {
  const [custom, setCustom] = useState('');
  const validCustom = isSingleEmoji(custom);
  return (
    <div className="emoji-chooser">
      <div className="emoji-grid" aria-label="Emoji choices">
        {EMOJI_CATALOG.map((emoji) => (
          <button
            aria-label={`Choose ${emoji}`}
            aria-pressed={selected === emoji}
            key={emoji}
            onClick={() => onChoose(emoji)}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="custom-emoji-row">
        <label>
          Any emoji
          <input
            autoComplete="off"
            inputMode="text"
            maxLength={64}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="Paste or type one emoji"
            value={custom}
          />
        </label>
        <button
          className="button-secondary compact-button"
          disabled={!validCustom}
          onClick={() => {
            if (!validCustom) return;
            onChoose(custom);
            setCustom('');
          }}
          type="button"
        >
          Choose
        </button>
      </div>
      {custom && !validCustom && (
        <p className="field-error" role="status">
          Enter one emoji only.
        </p>
      )}
    </div>
  );
}
