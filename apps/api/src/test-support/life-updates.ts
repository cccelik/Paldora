import { mediaAssets } from '@paldora/database';
import {
  lifeUpdatePageSchema,
  lifeUpdateSchema,
  type LifeUpdateView,
} from '@paldora/validation';
import { randomUUID } from 'node:crypto';
import { client, json } from './http.js';
import type { TestApp, TestUser } from './test-app.js';

/**
 * Life Update tooling for API tests: publishing and reading go through the
 * real API; only a processed photo is written straight to the database,
 * standing in for the worker.
 */
export function lifeUpdateTools(app: TestApp) {
  const as = (user: TestUser) => client(app, user);

  const publish = (user: TestUser, body: unknown) =>
    as(user).post('/life-updates', body);

  async function shareTo(
    user: TestUser,
    boxIds: readonly string[],
    extra: Record<string, unknown> = {},
  ): Promise<LifeUpdateView> {
    return lifeUpdateSchema.parse(
      await json(
        await publish(user, {
          audience: { type: 'boxes', boxIds },
          sections: { lifeLately: 'Busy, happy.' },
          ...extra,
        }),
        201,
      ),
    );
  }

  async function keepPrivate(
    user: TestUser,
    extra: Record<string, unknown> = {},
  ): Promise<LifeUpdateView> {
    return lifeUpdateSchema.parse(
      await json(
        await publish(user, {
          audience: { type: 'only_me' },
          sections: { reading: 'Dune' },
          ...extra,
        }),
        201,
      ),
    );
  }

  async function view(user: TestUser, lifeUpdateId: string) {
    return lifeUpdateSchema.parse(
      await json(await as(user).get(`/life-updates/${lifeUpdateId}`)),
    );
  }

  async function mine(user: TestUser, query = '') {
    return lifeUpdatePageSchema.parse(
      await json(await as(user).get(`/me/life-updates${query}`)),
    );
  }

  /** A `life_update_image` as the worker leaves it (user-scoped, no Box). */
  async function photo(
    owner: TestUser,
    overrides: Partial<typeof mediaAssets.$inferInsert> = {},
  ) {
    const id = randomUUID();
    const keys = {
      uploadObjectKey: `uploads/${id}`,
      masterObjectKey: `media/${id}/master.webp`,
      displayObjectKey: `media/${id}/display.webp`,
      thumbnailObjectKey: `media/${id}/thumbnail.webp`,
    };
    await app.database.insert(mediaAssets).values({
      id,
      ownerUserId: owner.id,
      purpose: 'life_update_image',
      status: 'ready',
      contentType: 'image/jpeg',
      contentLength: 1_000,
      uploadExpiresAt: new Date(),
      ...keys,
      width: 1600,
      height: 1200,
      ...overrides,
    });
    return { id, keys };
  }

  return { publish, shareTo, keepPrivate, view, mine, photo };
}
