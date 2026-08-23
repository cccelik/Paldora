'use client';

import type { PaldoraApiClient } from '@paldora/api-client';
import type { BoxId, MediaAssetId } from '@paldora/domain';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import {
  isSupportedImageFile,
  uploadFileToSignedRequest,
  type SupportedImageFile,
} from '../lib/image-upload';
import { PostComposerForm } from './post-composer-form';
import { Toast, ToastViewport, type ToastTone } from './ui';

const maxImages = 4;

export interface SelectedImage {
  file: SupportedImageFile;
  previewUrl: string;
}

interface ComposerFeedback {
  tone: ToastTone;
  message: string;
}

export function PostComposer({ boxId }: { boxId: BoxId }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [feedback, setFeedback] = useState<ComposerFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const contentId = useId();
  const imageInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());

  usePreviewCleanup(previewUrls);

  function selectImages(files: FileList | null) {
    if (!files) return;
    const available = maxImages - images.length;
    const selected = Array.from(files).slice(0, available);
    if (!selected.every(isSupportedImageFile)) {
      setFeedback({
        tone: 'warning',
        message: 'Choose JPEG, PNG, or WebP photos up to 10 MB each.',
      });
      return;
    }
    setFeedback(
      files.length > available
        ? {
            tone: 'warning',
            message: 'A post can contain up to four photos.',
          }
        : null,
    );
    const additions = createSelectedImages(selected, previewUrls.current);
    setImages((current) => [...current, ...additions]);
    setExpanded(true);
  }

  function removeImage(index: number) {
    setImages((current) =>
      removeSelectedImage(current, index, previewUrls.current),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() && images.length === 0) return;
    const includesPhotos = images.length > 0;
    setBusy(true);
    setFeedback(null);
    const api = createBrowserApiClient();
    const uploadedIds: MediaAssetId[] = [];
    try {
      await uploadImages(api, boxId, images, uploadedIds);
      await api.createPost(boxId, { content, mediaAssetIds: uploadedIds });
      releasePreviews(images, previewUrls.current);
      setImages([]);
      setContent('');
      setExpanded(false);
      setFeedback({
        tone: 'success',
        message: includesPhotos
          ? 'Post shared. Photos may take a moment to finish.'
          : 'Post shared.',
      });
      router.refresh();
    } catch {
      await Promise.allSettled(
        uploadedIds.map((id) => api.cancelPostMediaUpload(id)),
      );
      setFeedback({
        tone: 'error',
        message:
          'The post could not be shared. Check your connection and try again.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`post-composer${expanded ? ' expanded' : ''}`}
      aria-label="Create a post"
    >
      <PostComposerForm
        expanded={expanded}
        content={content}
        contentId={contentId}
        images={images}
        busy={busy}
        imageInput={imageInput}
        onSubmit={(event) => void submit(event)}
        onContentChange={(value) => {
          setContent(value);
          setExpanded(true);
        }}
        onExpand={() => setExpanded(true)}
        onCollapse={() => setExpanded(false)}
        onSelectImages={selectImages}
        onRemoveImage={removeImage}
      />
      <ComposerToast feedback={feedback} onDismiss={() => setFeedback(null)} />
    </section>
  );
}

function ComposerToast({
  feedback,
  onDismiss,
}: {
  feedback: ComposerFeedback | null;
  onDismiss: () => void;
}) {
  if (!feedback) return null;
  return (
    <ToastViewport>
      <Toast
        key={`${feedback.tone}:${feedback.message}`}
        message={feedback.message}
        tone={feedback.tone}
        onDismiss={onDismiss}
      />
    </ToastViewport>
  );
}

function usePreviewCleanup(previewUrls: RefObject<Set<string>>): void {
  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    },
    [previewUrls],
  );
}

async function uploadImages(
  api: PaldoraApiClient,
  boxId: BoxId,
  images: readonly SelectedImage[],
  uploadedIds: MediaAssetId[],
): Promise<void> {
  const uploads = await Promise.allSettled(
    images.map(async (image) => {
      const signed = await api.createPostMediaUpload(boxId, {
        contentType: image.file.type,
        contentLength: image.file.size,
      });
      uploadedIds.push(signed.mediaAsset.id);
      await uploadFileToSignedRequest(image.file, signed.upload);
      await api.completePostMediaUpload(signed.mediaAsset.id);
    }),
  );
  const failed = uploads.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failed) throw failed.reason;
}

function releasePreviews(
  images: readonly SelectedImage[],
  previewUrls: Set<string>,
): void {
  images.forEach(({ previewUrl }) => {
    URL.revokeObjectURL(previewUrl);
    previewUrls.delete(previewUrl);
  });
}

function createSelectedImages(
  files: readonly SupportedImageFile[],
  previewUrls: Set<string>,
): SelectedImage[] {
  return files.map((file) => {
    const previewUrl = URL.createObjectURL(file);
    previewUrls.add(previewUrl);
    return { file, previewUrl };
  });
}

function removeSelectedImage(
  images: readonly SelectedImage[],
  index: number,
  previewUrls: Set<string>,
): SelectedImage[] {
  const selected = images[index];
  if (selected) {
    URL.revokeObjectURL(selected.previewUrl);
    previewUrls.delete(selected.previewUrl);
  }
  return images.filter((_, itemIndex) => itemIndex !== index);
}
