'use server';

import type { NotificationId } from '@paldora/domain';
import { revalidatePath } from 'next/cache';
import { authenticatedApiClient } from '../lib/api';

export async function markNotificationReadAction(notificationId: string) {
  await (
    await authenticatedApiClient()
  ).markNotificationRead(notificationId as NotificationId);
  revalidatePath('/notifications');
}

export async function markAllNotificationsReadAction() {
  await (await authenticatedApiClient()).markAllNotificationsRead();
  revalidatePath('/notifications');
}
