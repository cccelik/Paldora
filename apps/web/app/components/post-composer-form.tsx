'use client';

import { type FormEvent, type RefObject } from 'react';
import type { SelectedImage } from './post-composer';

export function PostComposerForm({
  expanded,
  content,
  contentId,
  images,
  busy,
  imageInput,
  onSubmit,
  onContentChange,
  onExpand,
  onCollapse,
  onSelectImages,
  onRemoveImage,
}: {
  expanded: boolean;
  content: string;
  contentId: string;
  images: readonly SelectedImage[];
  busy: boolean;
  imageInput: RefObject<HTMLInputElement | null>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onContentChange: (value: string) => void;
  onExpand: () => void;
  onCollapse: () => void;
  onSelectImages: (files: FileList | null) => void;
  onRemoveImage: (index: number) => void;
}) {
  const empty = !content.trim() && images.length === 0;
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <label className="visually-hidden" htmlFor={contentId}>
        Post
      </label>
      <textarea
        aria-expanded={expanded}
        id={contentId}
        maxLength={5_000}
        name="content"
        placeholder="Share a thought or photo with this Box…"
        rows={expanded ? 4 : 1}
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
        onFocus={onExpand}
      />
      <SelectedImagePreviews images={images} onRemove={onRemoveImage} />
      {expanded && (
        <div className="post-composer-actions">
          <div>
            <input
              ref={imageInput}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => {
                onSelectImages(event.target.files);
                event.target.value = '';
              }}
            />
            <button
              className="button-quiet compact-button"
              type="button"
              disabled={busy || images.length >= 4}
              onClick={() => imageInput.current?.click()}
            >
              Add photos
            </button>
            <small>{images.length}/4 photos · 10 MB each</small>
          </div>
          <div>
            {empty && (
              <button
                className="button-quiet compact-button"
                type="button"
                onClick={onCollapse}
              >
                Cancel
              </button>
            )}
            <button
              className="button-primary post-submit"
              type="submit"
              disabled={busy || empty}
            >
              {busy ? 'Sharing…' : 'Share post'}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function SelectedImagePreviews({
  images,
  onRemove,
}: {
  images: readonly SelectedImage[];
  onRemove: (index: number) => void;
}) {
  if (images.length === 0) return null;
  return (
    <div className="post-media-previews" aria-label="Selected photos">
      {images.map((image, index) => (
        <div className="post-media-preview" key={image.previewUrl}>
          <img src={image.previewUrl} alt={`Selected photo ${index + 1}`} />
          <button
            type="button"
            aria-label={`Remove selected photo ${index + 1}`}
            onClick={() => onRemove(index)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
