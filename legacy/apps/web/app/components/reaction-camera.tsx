'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

export function ReactionCamera({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (file: File) => Promise<boolean>;
  pending: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);
  const startCamera = useCallback(async () => {
    stopCamera();
    setError(null);
    setReady(false);
    if (!window.isSecureContext) {
      setError(
        'Camera access requires HTTPS. For local testing, open Paldora on localhost.',
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera reactions are not supported by this browser.');
      return;
    }
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    } catch (cause) {
      setError(cameraErrorMessage(cause));
    } finally {
      setRequesting(false);
    }
  }, [stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('The photo could not be captured. Try again.');
          return;
        }
        stopCamera();
        const file = new File([blob], `camera-reaction-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        setCaptured(file);
        setPreviewUrl(URL.createObjectURL(file));
      },
      'image/jpeg',
      0.88,
    );
  };

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCaptured(null);
    void startCamera();
  };

  return (
    <div className="reaction-camera-backdrop" role="presentation">
      <section
        aria-label="Take a camera reaction"
        aria-modal="true"
        className="reaction-camera-dialog"
        role="dialog"
      >
        <CameraHeader onClose={onClose} />
        <CameraStage
          error={error}
          previewUrl={previewUrl}
          ready={ready}
          videoRef={videoRef}
        />
        <CameraControls
          captured={captured}
          onCapture={capture}
          onClose={onClose}
          onEnable={() => void startCamera()}
          onRetake={retake}
          onSubmit={onSubmit}
          pending={pending}
          ready={ready}
          requesting={requesting}
        />
      </section>
    </div>
  );
}

function CameraStage({
  error,
  previewUrl,
  ready,
  videoRef,
}: {
  error: string | null;
  previewUrl: string | null;
  ready: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  return (
    <div className="reaction-camera-stage">
      {previewUrl ? (
        <img alt="Your captured camera reaction" src={previewUrl} />
      ) : (
        <>
          <video muted playsInline ref={videoRef} />
          {!ready && !error && <CameraPermissionExplanation />}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function CameraPermissionExplanation() {
  return (
    <div className="reaction-camera-permission">
      <span aria-hidden="true">📷</span>
      <strong>Enable your camera</strong>
      <span>
        Your browser will ask for permission. Paldora only captures the photo
        when you press the shutter.
      </span>
    </div>
  );
}

function CameraControls({
  captured,
  pending,
  ready,
  requesting,
  onCapture,
  onClose,
  onEnable,
  onRetake,
  onSubmit,
}: {
  captured: File | null;
  pending: boolean;
  ready: boolean;
  requesting: boolean;
  onCapture: () => void;
  onClose: () => void;
  onEnable: () => void;
  onRetake: () => void;
  onSubmit: (file: File) => Promise<boolean>;
}) {
  if (captured) {
    return (
      <footer>
        <button
          className="button-quiet"
          disabled={pending}
          onClick={onRetake}
          type="button"
        >
          Retake
        </button>
        <button
          className="button-primary"
          disabled={pending}
          onClick={() =>
            void onSubmit(captured).then((saved) => {
              if (saved) onClose();
            })
          }
          type="button"
        >
          {pending ? 'Posting…' : 'Post reaction'}
        </button>
      </footer>
    );
  }
  return (
    <footer>
      {ready ? (
        <button
          aria-label="Capture photo"
          className="reaction-camera-shutter"
          onClick={onCapture}
          type="button"
        >
          <span />
        </button>
      ) : (
        <button
          className="button-primary"
          disabled={requesting}
          onClick={onEnable}
          type="button"
        >
          {requesting ? 'Requesting permission…' : 'Enable camera'}
        </button>
      )}
    </footer>
  );
}

function cameraErrorMessage(cause: unknown) {
  const name = cause instanceof DOMException ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow camera access for this site in your browser settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No usable camera was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'The camera is unavailable or being used by another application. Close it there, then try again.';
  }
  return 'The camera could not be started. Check browser permission settings and try again.';
}

function CameraHeader({ onClose }: { onClose: () => void }) {
  return (
    <header>
      <div>
        <strong>Camera reaction</strong>
        <span>Captured now—not selected from your library.</span>
      </div>
      <button aria-label="Close camera" onClick={onClose} type="button">
        ×
      </button>
    </header>
  );
}
