'use client';

import type { ChangeEvent, RefObject } from 'react';

export function AvatarUploaderView({
  preview,
  message,
  busy,
  onboarding,
  inputRef,
  onChoose,
  onFileChange,
  onRemove,
  onSkip,
}: {
  preview: string;
  message: string;
  busy: boolean;
  onboarding: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChoose: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="avatar-uploader">
      <button
        className={`avatar-preview ${preview ? 'has-image' : ''}`}
        type="button"
        onClick={onChoose}
        disabled={busy}
        aria-label="Choose a profile photo"
      >
        {preview ? (
          <img src={preview} alt="Current profile" />
        ) : (
          <span>＋</span>
        )}
      </button>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChange}
      />
      <div className="avatar-actions">
        <button
          className="button-secondary"
          type="button"
          disabled={busy}
          onClick={onChoose}
        >
          {busy ? 'Uploading…' : preview ? 'Change photo' : 'Choose photo'}
        </button>
        {preview && !onboarding && (
          <button
            className="button-quiet danger"
            type="button"
            disabled={busy}
            onClick={onRemove}
          >
            Remove
          </button>
        )}
        {onboarding && (
          <button
            className="button-quiet"
            type="button"
            disabled={busy}
            onClick={onSkip}
          >
            Skip for now
          </button>
        )}
      </div>
      <p className="field-help" role="status">
        {message || 'JPEG, PNG, or WebP · 10 MB maximum'}
      </p>
    </div>
  );
}
