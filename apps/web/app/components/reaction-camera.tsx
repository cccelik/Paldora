'use client';

import { useId, useRef } from 'react';
import { type ActionOutcome } from '../lib/action-result';
import styles from './reaction-camera.module.css';
import { Button } from './ui';
import { useReactionCapture, type CaptureState } from './use-reaction-capture';
const statusText: Readonly<Record<CaptureState['phase'], string>> = {
  idle: '',
  requesting: 'Starting the camera. Allow it if your browser asks.',
  live: 'The camera is on.',
  paused: 'The camera turned off while this page was hidden.',
  captured: 'Photo taken. Send it, or retake it.',
  uploading: 'Uploading your photo…',
  processing: 'Getting your photo ready…',
  sent: 'Sent. Your camera reaction is on the post.',
  unavailable: '',
  failed: 'Sending didn’t work.',
};

function statusOf(state: CaptureState): string {
  if (state.phase === 'unavailable') return state.problem.title;
  if (state.phase === 'failed') return `Sending didn’t work. ${state.message}`;
  return statusText[state.phase];
}

const hasPreview = (
  state: CaptureState,
): state is Extract<CaptureState, { previewUrl: string }> =>
  'previewUrl' in state;

/**
 * A camera reaction for a post: a native modal dialog with a live, mirrored
 * preview, one capture, and Retake / Send. There is no file picker by
 * design; every dead end points back to emoji reactions.
 */
export function ReactionCamera({
  boxId,
  hasCameraReaction,
  sendReaction,
  removeReaction,
  triggerClassName,
}: {
  boxId: string;
  /** The viewer's reaction is already a camera image. */
  hasCameraReaction: boolean;
  sendReaction: (mediaAssetId: string) => Promise<ActionOutcome<unknown>>;
  removeReaction: () => void;
  triggerClassName?: string | undefined;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const capture = useReactionCapture({ boxId, sendReaction });
  const { state } = capture;

  const open = () => {
    dialog.current?.showModal();
    void capture.start();
  };
  const close = () => dialog.current?.close();
  const busy = state.phase === 'uploading' || state.phase === 'processing';

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-label={
          hasCameraReaction
            ? 'Camera reaction (yours is sent). Take a new one'
            : 'React with your camera'
        }
        aria-haspopup="dialog"
        onClick={open}
      >
        Camera
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`${id}-title`}
        onClose={capture.reset}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
      >
        <div className={styles.body}>
          <div className={styles.head}>
            <h2 id={`${id}-title`} className={styles.title}>
              Camera reaction
            </h2>
            <button type="button" className={styles.close} onClick={close}>
              Close
            </button>
          </div>
          <p className={styles.status} role="status">
            {statusOf(state)}
          </p>
          <CameraStage capture={capture} />
          <div className={styles.actions}>
            <PhaseActions capture={capture} close={close} />
            {hasCameraReaction && !busy && state.phase !== 'sent' ? (
              <Button
                variant="quiet"
                onClick={() => {
                  removeReaction();
                  close();
                }}
              >
                Remove my camera reaction
              </Button>
            ) : null}
          </div>
        </div>
      </dialog>
    </>
  );
}

type Capture = ReturnType<typeof useReactionCapture>;

/** The live video, the captured photo, or the reason there is neither. */
function CameraStage({ capture }: { capture: Capture }) {
  const { state } = capture;
  if (state.phase === 'live') {
    return (
      <video
        ref={capture.videoRef}
        className={`${styles.frame} ${styles.mirrored}`}
        aria-label="Camera preview"
        autoPlay
        muted
        playsInline
        onLoadedData={capture.markFrameReady}
      />
    );
  }
  if (hasPreview(state)) {
    return (
      <img
        className={styles.frame}
        src={state.previewUrl}
        alt="Your photo, ready to send"
      />
    );
  }
  if (state.phase === 'unavailable') {
    return <p className={styles.detail}>{state.problem.detail}</p>;
  }
  return null;
}

function PhaseActions({
  capture,
  close,
}: {
  capture: Capture;
  close: () => void;
}) {
  const { state } = capture;
  const backToEmoji = (
    <Button variant="secondary" onClick={close}>
      Back to emoji reactions
    </Button>
  );
  switch (state.phase) {
    case 'live':
      return (
        <>
          <Button
            autoFocus
            disabled={!capture.frameReady}
            onClick={() => void capture.capture()}
          >
            Take photo
          </Button>
          {backToEmoji}
        </>
      );
    case 'captured':
      return (
        <>
          <Button autoFocus onClick={() => void capture.send()}>
            Send
          </Button>
          <Button variant="secondary" onClick={() => void capture.start()}>
            Retake
          </Button>
        </>
      );
    case 'failed':
      return (
        <>
          <Button autoFocus onClick={() => void capture.send()}>
            Retry
          </Button>
          <Button variant="secondary" onClick={() => void capture.start()}>
            Retake
          </Button>
          {backToEmoji}
        </>
      );
    case 'sent':
      return (
        <Button autoFocus onClick={close}>
          Done
        </Button>
      );
    case 'paused':
      return (
        <>
          <Button autoFocus onClick={() => void capture.start()}>
            Start camera
          </Button>
          {backToEmoji}
        </>
      );
    case 'unavailable':
      return (
        <>
          {state.problem.retry ? (
            <Button autoFocus onClick={() => void capture.start()}>
              Try again
            </Button>
          ) : null}
          {backToEmoji}
        </>
      );
    default:
      return (
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
      );
  }
}
