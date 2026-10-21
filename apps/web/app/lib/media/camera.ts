/** The longest edge a camera reaction is sent at; the server limit is 1280. */
export const CAMERA_MAX_EDGE = 1_280;
/** JPEG quality for the canvas export (re-encoding also drops EXIF). */
export const CAMERA_JPEG_QUALITY = 0.88;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The frame size to draw: the video's own size, scaled down (never up) so
 * the longest edge is at most `maxEdge`, keeping the aspect ratio.
 */
export function fitWithin(source: Size, maxEdge: number = CAMERA_MAX_EDGE) {
  const width = Math.max(0, Math.floor(source.width));
  const height = Math.max(0, Math.floor(source.height));
  const longest = Math.max(width, height);
  if (longest === 0) return { width: 0, height: 0 };
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type CameraProblemKind =
  'insecure' | 'missing' | 'blocked' | 'busy' | 'unknown';

export interface CameraProblem {
  readonly kind: CameraProblemKind;
  readonly title: string;
  readonly detail: string;
  /** Whether "Try again" can help without leaving the page. */
  readonly retry: boolean;
}

const emojiStill = 'You can still react with an emoji.';

const problems: Readonly<Record<CameraProblemKind, CameraProblem>> = {
  insecure: {
    kind: 'insecure',
    title: 'Camera needs HTTPS',
    detail: `Browsers only allow the camera on a secure (https) connection. ${emojiStill}`,
    retry: false,
  },
  missing: {
    kind: 'missing',
    title: 'No camera found',
    detail: `Connect a camera, or use a device that has one. ${emojiStill}`,
    retry: true,
  },
  blocked: {
    kind: 'blocked',
    title: 'Camera access was blocked',
    detail: `To use it, allow the camera for this site in your browser’s site settings (usually the icon next to the address), then try again. ${emojiStill}`,
    retry: true,
  },
  busy: {
    kind: 'busy',
    title: 'The camera is busy',
    detail: `Another app may be using it. Close that app, then try again. ${emojiStill}`,
    retry: true,
  },
  unknown: {
    kind: 'unknown',
    title: 'The camera didn’t start',
    detail: `Try again in a moment. ${emojiStill}`,
    retry: true,
  },
};

const kindByErrorName: Readonly<Record<string, CameraProblemKind>> = {
  NotAllowedError: 'blocked',
  PermissionDeniedError: 'blocked',
  SecurityError: 'blocked',
  NotFoundError: 'missing',
  DevicesNotFoundError: 'missing',
  OverconstrainedError: 'missing',
  NotReadableError: 'busy',
  TrackStartError: 'busy',
};

export const cameraProblem = (kind: CameraProblemKind) => problems[kind];

/** Maps a `getUserMedia` rejection to what to tell the person. */
export function problemFromError(error: unknown): CameraProblem {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : '';
  return problems[kindByErrorName[name] ?? 'unknown'];
}

/** Why the camera cannot even be asked for, or null when it can. */
export function unsupportedReason(environment: {
  readonly isSecureContext: boolean;
  readonly hasGetUserMedia: boolean;
}): CameraProblem | null {
  if (!environment.isSecureContext) return problems.insecure;
  if (!environment.hasGetUserMedia) return problems.missing;
  return null;
}
