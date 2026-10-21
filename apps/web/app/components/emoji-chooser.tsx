'use client';

import { isSingleEmoji } from '@paldora/domain';
import { useId, useRef, useState, type ReactNode } from 'react';
import styles from './emoji-chooser.module.css';
/** A small, static set to pick from; any other emoji can be typed. */
export const CURATED_EMOJI = [
  '👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏',
  '🙏', '🥰', '😍', '🤗', '😎', '🤔', '😅', '😭',
  '🥳', '✨', '🌟', '💯', '💛', '💜', '🌸', '🌈',
  '☕', '🍰', '🎂', '📸', '🎶', '🫶', '🙌', '👀',
] as const; // prettier-ignore

/**
 * A native modal dialog for choosing one emoji: the presets, a curated grid,
 * and a free "Any emoji" field checked by the shared `isSingleEmoji`. The
 * dialog traps focus, closes on Escape, and returns focus to its trigger.
 */
export function EmojiChooser({
  title,
  trigger,
  triggerLabel,
  triggerClassName,
  presets = [],
  choiceLabel,
  onChoose,
  disabled = false,
}: {
  title: string;
  trigger: ReactNode;
  triggerLabel: string;
  triggerClassName?: string | undefined;
  presets?: readonly string[];
  choiceLabel: (emoji: string) => string;
  onChoose: (emoji: string) => void;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [custom, setCustom] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();

  const close = () => {
    dialog.current?.close();
    setCustom('');
    setProblem(null);
  };
  const choose = (emoji: string) => {
    close();
    onChoose(emoji);
  };
  const submitCustom = () => {
    const value = custom.trim();
    if (!isSingleEmoji(value)) {
      setProblem('Enter one emoji, like 🦄.');
      return;
    }
    choose(value);
  };
  const extra = CURATED_EMOJI.filter((emoji) => !presets.includes(emoji));

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => dialog.current?.showModal()}
      >
        {trigger}
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`${id}-title`}
        onClose={() => {
          setCustom('');
          setProblem(null);
        }}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
      >
        <div className={styles.body}>
          <div className={styles.head}>
            <h2 id={`${id}-title`} className={styles.title}>
              {title}
            </h2>
            <button type="button" className={styles.close} onClick={close}>
              Close
            </button>
          </div>
          {presets.length > 0 ? (
            <EmojiGrid
              label="Your shortcuts"
              emoji={presets}
              choiceLabel={choiceLabel}
              onChoose={choose}
            />
          ) : null}
          <EmojiGrid
            label="More emoji"
            emoji={extra}
            choiceLabel={choiceLabel}
            onChoose={choose}
          />
          <div className={styles.custom}>
            <label htmlFor={`${id}-any`} className={styles.label}>
              Any emoji
            </label>
            <div className={styles.customRow}>
              <input
                id={`${id}-any`}
                className={styles.input}
                value={custom}
                autoComplete="off"
                maxLength={64}
                aria-describedby={`${id}-problem`}
                aria-invalid={problem ? true : undefined}
                onChange={(event) => {
                  setCustom(event.target.value);
                  setProblem(null);
                }}
                onKeyDown={(event) => {
                  // No nested form: the chooser can sit inside one.
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitCustom();
                  }
                }}
              />
              <button
                type="button"
                className={styles.use}
                onClick={submitCustom}
              >
                Use
              </button>
            </div>
            <p id={`${id}-problem`} className={styles.problem} role="status">
              {problem}
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}

function EmojiGrid({
  label,
  emoji,
  choiceLabel,
  onChoose,
}: {
  label: string;
  emoji: readonly string[];
  choiceLabel: (emoji: string) => string;
  onChoose: (emoji: string) => void;
}) {
  return (
    <ul className={styles.grid} aria-label={label}>
      {emoji.map((item) => (
        <li key={item}>
          <button
            type="button"
            className={styles.choice}
            aria-label={choiceLabel(item)}
            onClick={() => onChoose(item)}
          >
            {item}
          </button>
        </li>
      ))}
    </ul>
  );
}
