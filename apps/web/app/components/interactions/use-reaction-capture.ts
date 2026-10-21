'use client';

import {
  completeReactionImage,
  prepareReactionImage,
  reactionImageStatus,
} from '@/actions/reaction-media';
import { type ActionOutcome } from '@/lib/actions/action-result';
import {
  CAMERA_JPEG_QUALITY,
  fitWithin,
  problemFromError,
  unsupportedReason,
  type CameraProblem,
} from '@/lib/media/camera';
import { putToSignedUrl } from '@/lib/media/image-upload';
import { untilProcessed } from '@/lib/media/media-polling';
import { MEDIA_PURPOSE_POLICIES } from '@paldora/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
/**
 * idle → requesting → live → captured → uploading → processing → sent.
 * `paused` is live interrupted by a hidden page; `unavailable` is a camera
 * that cannot start; `failed` is a send that can be retried.
 */
export type CaptureState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'requesting' }
  | { readonly phase: 'live' }
  | { readonly phase: 'paused' }
  | { readonly phase: 'captured'; readonly previewUrl: string }
  | { readonly phase: 'uploading'; readonly previewUrl: string }
  | { readonly phase: 'processing'; readonly previewUrl: string }
  | { readonly phase: 'sent' }
  | { readonly phase: 'unavailable'; readonly problem: CameraProblem }
  | {
      readonly phase: 'failed';
      readonly previewUrl: string;
      readonly message: string;
    };

type Uploaded =
  | { readonly ok: true; readonly mediaAssetId: string }
  | { readonly ok: false; readonly message: string };

/** Reserve → PUT → complete, for one JPEG frame in the post's Box. */
async function uploadFrame(boxId: string, frame: Blob): Promise<Uploaded> {
  if (frame.size > MEDIA_PURPOSE_POLICIES.reaction_image.maxBytes) {
    return { ok: false, message: 'The photo is too large to send.' };
  }
  const prepared = await prepareReactionImage({
    boxId,
    contentType: 'image/jpeg',
    contentLength: frame.size,
  });
  if (prepared.status !== 'success') {
    return { ok: false, message: prepared.message };
  }
  try {
    await putToSignedUrl(frame, prepared.data);
  } catch {
    return { ok: false, message: 'The photo didn’t upload.' };
  }
  const completed = await completeReactionImage(prepared.data.mediaAssetId);
  if (completed.status !== 'success') {
    return { ok: false, message: completed.message };
  }
  return { ok: true, mediaAssetId: prepared.data.mediaAssetId };
}

/** Draws the current video frame, downscaled, as a JPEG. */
function grabFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const size = fitWithin({
    width: video.videoWidth,
    height: video.videoHeight,
  });
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (size.width === 0 || !context) return Promise.resolve(null);
  context.drawImage(video, 0, 0, size.width, size.height);
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', CAMERA_JPEG_QUALITY);
  });
}

const stopTracks = (stream: MediaStream | null) => {
  for (const track of stream?.getTracks() ?? []) track.stop();
};

/**
 * The camera-reaction state machine. The camera runs only while `live`:
 * tracks stop on capture, close, unmount, and when the page is hidden.
 * Every async step checks a generation number, so a closed dialog never
 * sends a reaction late. Unsent uploads are reaped by the server.
 */
export function useReactionCapture({
  boxId,
  sendReaction,
}: {
  boxId: string;
  sendReaction: (mediaAssetId: string) => Promise<ActionOutcome<unknown>>;
}) {
  const [state, setState] = useState<CaptureState>({ phase: 'idle' });
  const [frameReady, setFrameReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<Blob | null>(null);
  const preview = useRef<string | null>(null);
  const generation = useRef(0);
  /** The generation of a permission request still waiting for an answer. */
  const asking = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    stopTracks(stream.current);
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setFrameReady(false);
  }, []);

  const clearFrame = useCallback(() => {
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null;
    frame.current = null;
  }, []);

  const start = useCallback(async () => {
    clearFrame();
    const unsupported = unsupportedReason({
      isSecureContext: window.isSecureContext,
      hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    });
    if (unsupported) {
      setState({ phase: 'unavailable', problem: unsupported });
      return;
    }
    generation.current += 1;
    const mine = generation.current;
    setState({ phase: 'requesting' });
    asking.current = mine;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 } },
        audio: false,
      });
      if (mine !== generation.current) return stopTracks(media);
      asking.current = null;
      stream.current = media;
      setState({ phase: 'live' });
    } catch (error) {
      if (mine === generation.current) {
        asking.current = null;
        setState({ phase: 'unavailable', problem: problemFromError(error) });
      }
    }
  }, [clearFrame]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const blob = await grabFrame(video);
    if (!blob) return;
    stopCamera();
    clearFrame();
    frame.current = blob;
    preview.current = URL.createObjectURL(blob);
    setState({ phase: 'captured', previewUrl: preview.current });
  }, [clearFrame, stopCamera]);

  const send = useCallback(async () => {
    const blob = frame.current;
    const previewUrl = preview.current;
    if (!blob || !previewUrl) return;
    generation.current += 1;
    const mine = generation.current;
    const current = () => mine === generation.current;
    const fail = (message: string) =>
      setState({ phase: 'failed', previewUrl, message });
    setState({ phase: 'uploading', previewUrl });
    const uploaded = await uploadFrame(boxId, blob);
    if (!current()) return;
    if (!uploaded.ok) return fail(uploaded.message);
    setState({ phase: 'processing', previewUrl });
    const id = uploaded.mediaAssetId;
    const outcome = await untilProcessed(id, reactionImageStatus);
    if (!current()) return;
    if (outcome !== 'ready') return fail('The photo couldn’t be processed.');
    const result = await sendReaction(id);
    if (!current()) return;
    if (result.status === 'error') return fail(result.message);
    clearFrame();
    setState({ phase: 'sent' });
  }, [boxId, clearFrame, sendReaction]);

  /** Back to idle: camera off, frame dropped, late answers ignored. */
  const reset = useCallback(() => {
    generation.current += 1;
    asking.current = null;
    stopCamera();
    clearFrame();
    setState({ phase: 'idle' });
  }, [clearFrame, stopCamera]);

  // Attach the stream once the live <video> is on screen.
  useEffect(() => {
    const video = videoRef.current;
    if (state.phase !== 'live' || !video || !stream.current) return;
    video.srcObject = stream.current;
    void video.play().catch(() => undefined);
  }, [state.phase]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      // Only a running or starting camera stops; an upload carries on.
      if (!stream.current && asking.current === null) return;
      generation.current += 1;
      asking.current = null;
      stopCamera();
      setState((now) =>
        now.phase === 'live' || now.phase === 'requesting'
          ? { phase: 'paused' }
          : now,
      );
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stopCamera]);

  useEffect(
    () => () => {
      generation.current += 1;
      stopTracks(stream.current);
      if (preview.current) URL.revokeObjectURL(preview.current);
    },
    [],
  );

  return {
    state,
    videoRef,
    frameReady,
    markFrameReady: () => setFrameReady(true),
    start,
    capture,
    send,
    reset,
  };
}
