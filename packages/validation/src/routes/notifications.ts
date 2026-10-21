import { notificationPageSchema, unreadCountSchema } from '../notifications.js';
import { cursorPageQuerySchema } from '../primitives.js';
import { noContent } from './no-content.js';
import { defineRoute } from '../route.js';

const notificationsTag = 'Notifications';

export const listNotifications = defineRoute({
  operationId: 'listNotifications',
  method: 'GET',
  path: '/me/notifications',
  summary:
    'Your notifications, newest first, with the unread count. Visibility is rechecked on every read: a notification disappears once its post, comment, or reaction is gone, you leave the Box, or a block exists with the actor. Everything shown is joined from live rows.',
  tag: notificationsTag,
  access: 'authenticated',
  successStatus: 200,
  response: notificationPageSchema,
  query: cursorPageQuerySchema,
  errors: [],
});

export const getUnreadCount = defineRoute({
  operationId: 'getUnreadCount',
  method: 'GET',
  path: '/me/notifications/unread-count',
  summary:
    'How many visible notifications are unread, counted up to 100 (`capped` is true when there may be more).',
  tag: notificationsTag,
  access: 'authenticated',
  successStatus: 200,
  response: unreadCountSchema,
  errors: [],
});

export const markNotificationRead = defineRoute({
  operationId: 'markNotificationRead',
  method: 'POST',
  path: '/me/notifications/{notificationId}/read',
  summary:
    'Mark one notification read (idempotent). Other people’s, hidden, and missing notifications all answer NOTIFICATION_NOT_FOUND.',
  tag: notificationsTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['NOTIFICATION_NOT_FOUND'],
});

export const markAllNotificationsRead = defineRoute({
  operationId: 'markAllNotificationsRead',
  method: 'POST',
  path: '/me/notifications/read-all',
  summary: 'Mark every notification you can currently see as read.',
  tag: notificationsTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: [],
});
