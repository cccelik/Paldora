import { type CommentItemView } from '@paldora/validation';
export interface ThreadData {
  /** Null when the root is gone but the thread is linked to directly. */
  readonly root: CommentItemView | null;
  readonly rootId: string;
  readonly replies: readonly CommentItemView[];
  readonly replyCount: number;
}
