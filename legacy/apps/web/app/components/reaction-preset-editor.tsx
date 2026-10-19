'use client';

import type { ReactionPresets } from '@paldora/domain';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import { EmojiChooser } from './emoji-chooser';
import { Toast, ToastViewport, type ToastTone } from './ui';

export function ReactionPresetEditor({
  presets,
}: {
  presets: ReactionPresets;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState([...presets]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: ToastTone;
  } | null>(null);

  const choose = (emoji: string) => {
    if (activeIndex === null) return;
    if (draft.some((item, index) => item === emoji && index !== activeIndex)) {
      setMessage({
        text: 'Choose a different emoji for each preset.',
        tone: 'warning',
      });
      return;
    }
    setDraft((current) =>
      current.map((item, index) => (index === activeIndex ? emoji : item)),
    );
    setActiveIndex(null);
  };
  const save = async () => {
    setPending(true);
    try {
      const reactionPresets: ReactionPresets = [
        draft[0]!,
        draft[1]!,
        draft[2]!,
        draft[3]!,
        draft[4]!,
      ];
      await createBrowserApiClient().updateProfile({
        reactionPresets,
      });
      setMessage({ text: 'Reaction presets saved.', tone: 'success' });
      router.refresh();
    } catch {
      setMessage({
        text: 'Reaction presets could not be saved. Try again.',
        tone: 'error',
      });
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="reaction-preset-editor">
      <p>Choose the five reactions shown first on every post.</p>
      <div className="preset-buttons" aria-label="Reaction presets">
        {draft.map((emoji, index) => (
          <button
            aria-label={`Change preset ${index + 1}, currently ${emoji}`}
            aria-pressed={activeIndex === index}
            key={`${index}-${emoji}`}
            onClick={() => setActiveIndex(index)}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
      {activeIndex !== null && (
        <div className="preset-chooser-panel">
          <div className="preset-chooser-heading">
            <strong>Choose preset {activeIndex + 1}</strong>
            <button
              aria-label="Close emoji chooser"
              className="button-quiet compact-button"
              onClick={() => setActiveIndex(null)}
              type="button"
            >
              Close
            </button>
          </div>
          <EmojiChooser selected={draft[activeIndex]} onChoose={choose} />
        </div>
      )}
      <button
        className="button-secondary settings-submit"
        disabled={
          pending || draft.every((emoji, index) => emoji === presets[index])
        }
        onClick={() => void save()}
        type="button"
      >
        {pending ? 'Saving…' : 'Save reaction presets'}
      </button>
      {message && (
        <ToastViewport>
          <Toast
            message={message.text}
            onDismiss={() => setMessage(null)}
            tone={message.tone}
          />
        </ToastViewport>
      )}
    </div>
  );
}
