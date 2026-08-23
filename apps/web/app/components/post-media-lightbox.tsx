'use client';

import type { Post, PostId } from '@paldora/domain';
import { useState, type RefObject } from 'react';

export function PostMediaLightbox({
  media,
  authorName,
  postId,
  selectedIndex,
  dialogRef,
  onSelect,
}: {
  media: Post['media'];
  authorName: string;
  postId: PostId;
  selectedIndex: number;
  dialogRef: RefObject<HTMLDialogElement | null>;
  onSelect: (index: number) => void;
}) {
  const [message, setMessage] = useState('');
  const selected = media[selectedIndex];
  const close = () => dialogRef.current?.close();

  async function save() {
    if (!selected?.url) return;
    setMessage('Preparing download…');
    try {
      const blob = selected.url.startsWith('data:')
        ? dataUrlToBlob(selected.url)
        : await downloadBlob(selected.url);
      download(blob, `paldora-${postId}-${selectedIndex + 1}.webp`);
      setMessage('Photo saved.');
    } catch {
      setMessage('The photo could not be saved. Try again.');
    }
  }

  async function share() {
    const url = `${window.location.origin}/posts/${postId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${authorName}'s photo on Paldora`,
          text: 'View this private Box post on Paldora.',
          url,
        });
        setMessage('Post shared.');
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage('Private post link copied.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage('The private post link could not be shared.');
    }
  }

  return (
    <dialog
      aria-label={`Photo viewer for ${authorName}`}
      className="post-lightbox"
      ref={dialogRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onClose={() => setMessage('')}
    >
      <LightboxToolbar
        count={media.length}
        selectedIndex={selectedIndex}
        onClose={close}
        onSave={() => void save()}
        onShare={() => void share()}
      />
      <LightboxStage
        media={media}
        authorName={authorName}
        selectedIndex={selectedIndex}
        onClose={close}
        onSelect={onSelect}
      />
      <footer className="post-lightbox-footer">
        <span>Only Box members can open shared post links.</span>
        <span role="status">{message}</span>
      </footer>
    </dialog>
  );
}

function LightboxStage({
  media,
  authorName,
  selectedIndex,
  onClose,
  onSelect,
}: {
  media: Post['media'];
  authorName: string;
  selectedIndex: number;
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  const selected = media[selectedIndex];
  return (
    <div
      className="post-lightbox-stage"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {media.length > 1 && (
        <NavigationButton
          direction="previous"
          onClick={() =>
            onSelect((selectedIndex - 1 + media.length) % media.length)
          }
        />
      )}
      {selected?.status === 'ready' && selected.url ? (
        <img
          src={selected.url}
          alt={`Photo ${selectedIndex + 1} shared by ${authorName}`}
        />
      ) : (
        <p>This photo is not ready.</p>
      )}
      {media.length > 1 && (
        <NavigationButton
          direction="next"
          onClick={() => onSelect((selectedIndex + 1) % media.length)}
        />
      )}
    </div>
  );
}

function LightboxToolbar({
  count,
  selectedIndex,
  onClose,
  onSave,
  onShare,
}: {
  count: number;
  selectedIndex: number;
  onClose: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  return (
    <header className="post-lightbox-toolbar">
      <button
        className="post-lightbox-close"
        type="button"
        aria-label="Close photo viewer"
        onClick={onClose}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 5l14 14M19 5 5 19" />
        </svg>
      </button>
      <span>
        {selectedIndex + 1} of {count}
      </span>
      <div>
        <button type="button" onClick={onSave}>
          Save
        </button>
        <button type="button" onClick={onShare}>
          Share
        </button>
      </div>
    </header>
  );
}

function NavigationButton({
  direction,
  onClick,
}: {
  direction: 'previous' | 'next';
  onClick: () => void;
}) {
  return (
    <button
      className={`post-lightbox-${direction}`}
      type="button"
      aria-label={`${direction === 'previous' ? 'Previous' : 'Next'} photo`}
      onClick={onClick}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d={direction === 'previous' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
      </svg>
    </button>
  );
}

function download(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

async function downloadBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Download failed.');
  return response.blob();
}

function dataUrlToBlob(url: string): Blob {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(url);
  if (!match?.[1] || !match[2]) throw new Error('Invalid image data URL.');
  const bytes = Uint8Array.from(atob(match[2]), (character) =>
    character.charCodeAt(0),
  );
  return new Blob([bytes], { type: match[1] });
}
