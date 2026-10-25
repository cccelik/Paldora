'use server';

import {
  actionError,
  type ActionOutcome,
  type ActionResult,
} from '@/lib/actions/action-result';
import { textField } from '@/lib/actions/form-data';
import { notificationHref } from '@/lib/notifications/notification-text';

import { firebaseWebData } from '@/lib/server/firebase/data';
import { requireFirebaseActionOrigin } from '@/lib/server/firebase/origin';
import { uuidSchema, type UnreadCount } from '@paldora/validation';
import { type Route } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
const openForm = z.object({
  notificationId: uuidSchema,
  postId: uuidSchema,
  commentId: z.union([uuidSchema, z.literal('')]),
  lifeUpdateId: z.union([uuidSchema, z.literal('')]),
  boxId: uuidSchema,
});

/**
 * A notification row is a plain form, so it works without JavaScript: mark
 * it read, then go to what it is about. A row that has meanwhile become
 * invisible (deleted, blocked, left the Box) leads back to the list.
 */
export async function openNotificationAction(formData: FormData) {
  const parsed = openForm.safeParse({
    notificationId: textField(formData, 'notificationId'),
    postId: textField(formData, 'postId'),
    commentId: textField(formData, 'commentId'),
    lifeUpdateId: textField(formData, 'lifeUpdateId'),
    boxId: textField(formData, 'boxId'),
  });
  if (!parsed.success) redirect('/notifications');
  const { notificationId, postId, commentId, lifeUpdateId, boxId } =
    parsed.data;
  let visible = true;
  let destination = {
    postId,
    commentId: commentId || null,
    lifeUpdateId: lifeUpdateId || null,
    boxId,
  };
  try {
    {
      await requireFirebaseActionOrigin();
      const item = await (
        await firebaseWebData()
      ).markNotificationRead(notificationId);
      destination = {
        postId: item.postId,
        commentId: item.commentId,
        lifeUpdateId: item.lifeUpdateId,
        boxId: item.box.id,
      };
    }
  } catch {
    visible = false;
  }
  // `redirect` throws, so it stays outside the try block.
  revalidatePath('/notifications');
  if (!visible) redirect('/notifications');
  redirect(notificationHref(destination) as Route);
}

export async function markAllNotificationsReadAction(
  _previous: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  void _previous;
  void _formData;
  {
    try {
      await requireFirebaseActionOrigin();
      await (await firebaseWebData()).markAllNotificationsRead();
      revalidatePath('/notifications');
      return { status: 'success', message: 'All caught up.', data: undefined };
    } catch (error) {
      return actionError(error);
    }
  }
}

/** The bell's refetch after a realtime hint. */
export async function unreadCountAction(): Promise<ActionOutcome<UnreadCount>> {
  try {
    const count = await (await firebaseWebData()).unreadNotificationCount();
    return { status: 'success', message: 'Counted.', data: count };
  } catch (error) {
    return actionError(error);
  }
}
