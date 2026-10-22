import {
  getMyRoomPersonalization,
  getRoomPersonalization,
  updateMyRoomPersonalization,
} from './personalization.js';
import {
  createReport,
  listMyReports,
  listMyModerationNotices,
  listModerationCases,
  getModerationCase,
  actOnModerationCase,
  getModerationAccount,
} from './reports.js';
import {
  requestAccountExport,
  getAccountExport,
  downloadAccountExport,
} from './account-exports.js';
import {
  requestAccountDeletion,
  getAccountDeletion,
  cancelAccountDeletion,
} from './account-deletion.js';
import type { RouteDefinition } from '../route.js';
import { getLiveness, getReadiness } from './platform.js';
import {
  getCurrentUser,
  updateProfile,
  getUsernameAvailability,
  updatePreferences,
  deleteAvatar,
} from './identity.js';
import {
  createMediaUpload,
  completeMediaUpload,
  getMediaAsset,
} from './media.js';
import {
  listFriends,
  listFriendRequests,
  createFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  listBlocks,
  createBlock,
  removeBlock,
} from './people.js';
import {
  listBoxes,
  createBox,
  getBox,
  updateBox,
  deleteBox,
  listBoxMembers,
  updateBoxMember,
  leaveBox,
  removeBoxMember,
  transferBoxOwnership,
  createBoxInvitation,
  listBoxInvitations,
  revokeBoxInvitation,
  listMyBoxInvitations,
  acceptBoxInvitation,
  declineBoxInvitation,
} from './boxes.js';
import {
  createPost,
  listBoxPosts,
  getHomeFeed,
  getPost,
  updatePost,
  deletePost,
} from './posts.js';
import {
  createComment,
  listComments,
  listReplies,
  getComment,
  updateComment,
  deleteComment,
} from './comments.js';
import {
  setPostReaction,
  setCommentReaction,
  listPostReactions,
  setReactionPresets,
} from './reactions.js';
import { openEventStream } from './realtime.js';
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from './notifications.js';
import {
  createLifeUpdate,
  getLifeUpdate,
  updateLifeUpdate,
  deleteLifeUpdate,
  listMyLifeUpdates,
} from './life-updates.js';
import {
  listMyMemories,
  getMyMemorySummary,
  listBoxMemories,
  getBoxMemorySummary,
} from './memories.js';
import {
  getMyRoom,
  getRoom,
  listRoomContent,
  getRoomContentSummary,
  listRoomPhotos,
  updateMyRoom,
  updateMyRoomWidgets,
  updateMyRoomTopFriends,
} from './rooms.js';

export * from './platform.js';
export * from './identity.js';
export * from './media.js';
export * from './people.js';
export * from './boxes.js';
export * from './posts.js';
export * from './comments.js';
export * from './reactions.js';
export * from './realtime.js';
export * from './notifications.js';
export * from './life-updates.js';
export * from './memories.js';
export * from './rooms.js';
export * from './reports.js';
export * from './account-exports.js';
export * from './account-deletion.js';

/** Every operation in the public contract. Add new routes here. */
export const apiRoutes = {
  requestAccountExport,
  getAccountExport,
  downloadAccountExport,
  requestAccountDeletion,
  getAccountDeletion,
  cancelAccountDeletion,
  createReport,
  listMyReports,
  listMyModerationNotices,
  listModerationCases,
  getModerationCase,
  actOnModerationCase,
  getModerationAccount,
  getMyRoomPersonalization,
  getRoomPersonalization,
  updateMyRoomPersonalization,
  getLiveness,
  getReadiness,
  getCurrentUser,
  updateProfile,
  getUsernameAvailability,
  updatePreferences,
  deleteAvatar,
  createMediaUpload,
  completeMediaUpload,
  getMediaAsset,
  listFriends,
  listFriendRequests,
  createFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
  listBlocks,
  createBlock,
  removeBlock,
  listBoxes,
  createBox,
  getBox,
  updateBox,
  deleteBox,
  listBoxMembers,
  updateBoxMember,
  leaveBox,
  removeBoxMember,
  transferBoxOwnership,
  createBoxInvitation,
  listBoxInvitations,
  revokeBoxInvitation,
  listMyBoxInvitations,
  acceptBoxInvitation,
  declineBoxInvitation,
  createPost,
  listBoxPosts,
  getHomeFeed,
  getPost,
  updatePost,
  deletePost,
  createComment,
  listComments,
  listReplies,
  getComment,
  updateComment,
  deleteComment,
  openEventStream,
  setPostReaction,
  setCommentReaction,
  listPostReactions,
  setReactionPresets,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  createLifeUpdate,
  getLifeUpdate,
  updateLifeUpdate,
  deleteLifeUpdate,
  listMyLifeUpdates,
  listMyMemories,
  getMyMemorySummary,
  listBoxMemories,
  getBoxMemorySummary,
  getMyRoom,
  getRoom,
  listRoomContent,
  getRoomContentSummary,
  listRoomPhotos,
  updateMyRoom,
  updateMyRoomWidgets,
  updateMyRoomTopFriends,
} as const satisfies Record<string, RouteDefinition>;

export * from './personalization.js';
