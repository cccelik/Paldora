import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { errorEnvelopeSchema } from './errors.js';
import { boxSchema, createBoxSchema } from './boxes.js';
import { currentUserSchema, updateProfileSchema } from './identity.js';
import { friendshipSchema } from './people.js';
import { createMediaUploadSchema } from './media.js';
import { commentItemSchema, createCommentSchema } from './comments.js';
import { notificationSchema, unreadCountSchema } from './notifications.js';
import { postSchema } from './posts.js';
import {
  createLifeUpdateSchema,
  lifeUpdateSchema,
  updateLifeUpdateSchema,
} from './life-updates.js';
import { feedItemSchema } from './feeds.js';
import {
  memoryItemSchema,
  memoryQuerySchema,
  memorySummarySchema,
} from './memories.js';
import { reactionPresetsSchema, setPostReactionSchema } from './reactions.js';
import { cursorPageQuerySchema } from './primitives.js';

interface Fixture {
  schema: string;
  valid: unknown[];
  invalid: unknown[];
}

const schemas: Record<string, z.ZodType> = {
  ErrorEnvelope: errorEnvelopeSchema,
  CursorPageQuery: cursorPageQuerySchema,
  CurrentUser: currentUserSchema,
  UpdateProfileRequest: updateProfileSchema,
  CreateMediaUploadRequest: createMediaUploadSchema,
  Box: boxSchema,
  Friendship: friendshipSchema,
  CreateBoxRequest: createBoxSchema,
  Post: postSchema,
  CommentItem: commentItemSchema,
  CreateCommentRequest: createCommentSchema,
  SetPostReactionRequest: setPostReactionSchema,
  ReactionPresetsRequest: reactionPresetsSchema,
  Notification: notificationSchema,
  UnreadCount: unreadCountSchema,
  CreateLifeUpdateRequest: createLifeUpdateSchema,
  LifeUpdate: lifeUpdateSchema,
  UpdateLifeUpdateRequest: updateLifeUpdateSchema,
  FeedItem: feedItemSchema,
  MemoryItem: memoryItemSchema,
  MemoryQuery: memoryQuerySchema,
  MemorySummary: memorySummarySchema,
};

const fixtureDirectory = fileURLToPath(
  new URL('../../../contracts/fixtures/', import.meta.url),
);
const fixtures = readdirSync(fixtureDirectory)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    name,
    fixture: JSON.parse(
      readFileSync(`${fixtureDirectory}${name}`, 'utf8'),
    ) as Fixture,
  }));

describe('contract conformance fixtures', () => {
  it('exist', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const { name, fixture } of fixtures) {
    describe(name, () => {
      const schema = schemas[fixture.schema];

      it('names a known schema', () => {
        expect(schema, `unknown schema ${fixture.schema}`).toBeDefined();
      });

      it.each(fixture.valid.map((value) => [JSON.stringify(value), value]))(
        'accepts %s',
        (_label, value) => {
          expect(schema?.safeParse(value).success).toBe(true);
        },
      );

      it.each(fixture.invalid.map((value) => [JSON.stringify(value), value]))(
        'rejects %s',
        (_label, value) => {
          expect(schema?.safeParse(value).success).toBe(false);
        },
      );
    });
  }
});
