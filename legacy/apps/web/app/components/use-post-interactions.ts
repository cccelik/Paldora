'use client';

import { ApiClientError } from '@paldora/api-client';
import type {
  Comment,
  CommentId,
  MediaAssetId,
  PostId,
  PostInteractions,
  ReactionKind,
} from '@paldora/domain';
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import { uploadFileToSignedRequest } from '../lib/image-upload';
import {
  PALDORA_ACTIVITY_EVENT,
  type RealtimeActivityDetail,
} from '../lib/realtime-browser-event';
import type { ToastTone } from './ui';

export interface InteractionMessage {
  text: string;
  tone: ToastTone;
}

export function usePostInteractions(postId: PostId, initial: PostInteractions) {
  const [summary, setSummary] = useState(initial);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reactionPending, setReactionPending] = useState(false);
  const [busyCommentId, setBusyCommentId] = useState<CommentId | null>(null);
  const [message, setMessage] = useState<InteractionMessage | null>(null);
  const commentReaction = useCommentReactionMutation(setComments, setMessage);

  useEffect(() => {
    setSummary(initial);
  }, [initial]);

  const loadComments = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      try {
        const page = await createBrowserApiClient().postComments(postId, {
          ...(cursor ? { cursor } : {}),
          limit: 10,
        });
        setComments((current) =>
          cursor ? [...current, ...page.items] : page.items,
        );
        setNextCursor(page.nextCursor);
        setLoaded(true);
      } catch (error) {
        setInteractionError(error, setMessage);
      } finally {
        setLoading(false);
      }
    },
    [postId],
  );

  useRealtimeCommentRefresh({ loaded, loadComments, open, postId });
  const toggleComments = () => {
    setOpen((current) => !current);
    if (!loaded && !loading) void loadComments();
  };
  const setReaction = useCallback(
    async (kind: ReactionKind | null) => {
      setReactionPending(true);
      try {
        setSummary(
          await createBrowserApiClient().setPostReaction(postId, { kind }),
        );
      } catch (error) {
        setInteractionError(error, setMessage);
      } finally {
        setReactionPending(false);
      }
    },
    [postId],
  );
  const setRealReaction = async (file: File): Promise<boolean> => {
    setReactionPending(true);
    try {
      setSummary(await uploadRealReaction(postId, file));
      return true;
    } catch (error) {
      setInteractionError(error, setMessage);
      return false;
    } finally {
      setReactionPending(false);
    }
  };
  const createComment = async (
    content: string,
    parentCommentId?: CommentId,
  ) => {
    setBusyCommentId(parentCommentId ?? (postId as unknown as CommentId));
    try {
      await createBrowserApiClient().createComment(postId, {
        content,
        ...(parentCommentId ? { parentCommentId } : {}),
      });
      await loadComments();
      setSummary((current) => ({
        ...current,
        commentCount: current.commentCount + 1,
      }));
      return true;
    } catch (error) {
      setInteractionError(error, setMessage);
      return false;
    } finally {
      setBusyCommentId(null);
    }
  };
  const updateComment = async (commentId: CommentId, content: string) => {
    setBusyCommentId(commentId);
    try {
      await createBrowserApiClient().updateComment(commentId, { content });
      await loadComments();
      return true;
    } catch (error) {
      setInteractionError(error, setMessage);
      return false;
    } finally {
      setBusyCommentId(null);
    }
  };
  const deleteComment = async (commentId: CommentId) => {
    setBusyCommentId(commentId);
    try {
      await createBrowserApiClient().deleteComment(commentId);
      await loadComments();
      setSummary((current) => ({
        ...current,
        commentCount: Math.max(0, current.commentCount - 1),
      }));
      setMessage({ text: 'Comment deleted.', tone: 'success' });
    } catch (error) {
      setInteractionError(error, setMessage);
    } finally {
      setBusyCommentId(null);
    }
  };
  return {
    summary,
    open,
    comments,
    nextCursor,
    loaded,
    loading,
    reactionPending,
    busyCommentId,
    busyReactionCommentId: commentReaction.busyCommentId,
    message,
    setMessage,
    loadComments,
    toggleComments,
    setReaction,
    setRealReaction,
    createComment,
    updateComment,
    deleteComment,
    setCommentReaction: commentReaction.setReaction,
  };
}

function useCommentReactionMutation(
  setComments: Dispatch<SetStateAction<Comment[]>>,
  setMessage: (message: InteractionMessage | null) => void,
) {
  const [busyCommentId, setBusyCommentId] = useState<CommentId | null>(null);
  const setReaction = async (
    commentId: CommentId,
    kind: ReactionKind | null,
  ) => {
    setBusyCommentId(commentId);
    try {
      const interactions = await createBrowserApiClient().setCommentReaction(
        commentId,
        { kind },
      );
      setComments((current) =>
        updateCommentInteractions(current, commentId, interactions),
      );
    } catch (error) {
      setInteractionError(error, setMessage);
    } finally {
      setBusyCommentId(null);
    }
  };
  return { busyCommentId, setReaction };
}

function updateCommentInteractions(
  comments: readonly Comment[],
  commentId: CommentId,
  interactions: Comment['interactions'],
): Comment[] {
  return comments.map((comment) => ({
    ...comment,
    ...(comment.id === commentId ? { interactions } : {}),
    replies: updateCommentInteractions(
      comment.replies,
      commentId,
      interactions,
    ),
  }));
}

function useRealtimeCommentRefresh({
  loaded,
  loadComments,
  open,
  postId,
}: {
  loaded: boolean;
  loadComments: (cursor?: string) => Promise<void>;
  open: boolean;
  postId: PostId;
}): void {
  useEffect(() => {
    if (!open || !loaded) return;
    const refreshAffectedThread = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeActivityDetail>).detail;
      if (!detail?.type.startsWith('comment.')) return;
      try {
        const payload = JSON.parse(detail.data) as { postId?: string };
        if (payload.postId === postId) void loadComments();
      } catch {
        // A malformed event cannot invalidate the already-rendered thread.
      }
    };
    window.addEventListener(PALDORA_ACTIVITY_EVENT, refreshAffectedThread);
    return () =>
      window.removeEventListener(PALDORA_ACTIVITY_EVENT, refreshAffectedThread);
  }, [loaded, loadComments, open, postId]);
}

async function uploadRealReaction(
  postId: PostId,
  file: File,
): Promise<PostInteractions> {
  const api = createBrowserApiClient();
  let mediaAssetId: MediaAssetId | undefined;
  try {
    const signed = await api.createReactionPhotoUpload(postId, {
      contentType: 'image/jpeg',
      contentLength: file.size,
    });
    mediaAssetId = signed.mediaAsset.id;
    await uploadFileToSignedRequest(file, signed.upload);
    await api.completeReactionPhotoUpload(mediaAssetId);
    return api.setPostReaction(postId, { kind: 'real', mediaAssetId });
  } catch (error) {
    if (mediaAssetId) {
      await api.cancelReactionPhotoUpload(mediaAssetId).catch(() => undefined);
    }
    throw error;
  }
}

function setInteractionError(
  error: unknown,
  setMessage: (message: InteractionMessage) => void,
): void {
  setMessage({
    text:
      error instanceof ApiClientError
        ? error.message
        : 'The interaction could not be saved. Check your connection and try again.',
    tone: 'error',
  });
}
