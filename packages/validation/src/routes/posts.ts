import { feedPageSchema } from '../feeds.js';
import { createPostSchema, postSchema, updatePostSchema } from '../posts.js';
import { cursorPageQuerySchema } from '../primitives.js';
import { noContent } from './no-content.js';
import { defineRoute } from '../route.js';

const postsTag = 'Posts';

export const createPost = defineRoute({
  operationId: 'createPost',
  method: 'POST',
  path: '/boxes/{boxId}/posts',
  summary: 'Post to a Box you belong to. Archived Boxes are read-only.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 201,
  response: postSchema,
  body: createPostSchema,
  errors: ['BOX_NOT_FOUND', 'BOX_ARCHIVED'],
});

export const listBoxPosts = defineRoute({
  operationId: 'listBoxPosts',
  method: 'GET',
  path: '/boxes/{boxId}/posts',
  summary:
    'A Box’s posts and Life Updates, newest first. A Life Update carries only this Box’s context. Content by people in a block relationship with you appears as hidden items.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 200,
  response: feedPageSchema,
  query: cursorPageQuerySchema,
  errors: ['BOX_NOT_FOUND'],
});

export const getHomeFeed = defineRoute({
  operationId: 'getHomeFeed',
  method: 'GET',
  path: '/me/feed',
  summary:
    'Posts and Life Updates from all your Boxes, newest first (chronological, never ranked). A Life Update delivered to several of your Boxes appears once, with one context per Box you are in, alphabetically. Only Me Life Updates are not part of Home. Content by people in a block relationship with you appears as one hidden item each.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 200,
  response: feedPageSchema,
  query: cursorPageQuerySchema,
  errors: [],
});

export const getPost = defineRoute({
  operationId: 'getPost',
  method: 'GET',
  path: '/posts/{postId}',
  summary:
    'One post. Missing, deleted, outside your Boxes, and blocked authors all answer POST_NOT_FOUND.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 200,
  response: postSchema,
  errors: ['POST_NOT_FOUND'],
});

export const updatePost = defineRoute({
  operationId: 'updatePost',
  method: 'PATCH',
  path: '/posts/{postId}',
  summary:
    'Edit your own post. A Life Update’s backing post answers POST_MANAGED_BY_LIFE_UPDATE to its author: edit the Life Update instead.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 200,
  response: postSchema,
  body: updatePostSchema,
  errors: [
    'POST_NOT_FOUND',
    'POST_ACCESS_DENIED',
    'POST_MANAGED_BY_LIFE_UPDATE',
    'BOX_ARCHIVED',
  ],
});

export const deletePost = defineRoute({
  operationId: 'deletePost',
  method: 'DELETE',
  path: '/posts/{postId}',
  summary:
    'Delete your own post (idempotent). The text is erased. A Life Update’s backing post answers POST_MANAGED_BY_LIFE_UPDATE to its author: delete the Life Update instead.',
  tag: postsTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: [
    'POST_NOT_FOUND',
    'POST_ACCESS_DENIED',
    'POST_MANAGED_BY_LIFE_UPDATE',
    'BOX_ARCHIVED',
  ],
});
