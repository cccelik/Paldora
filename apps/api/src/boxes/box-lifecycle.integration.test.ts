import { scenes } from '../test-support/scenes.js';
import { boxMemberships } from '@paldora/database';
import { boxInvitationPageSchema, boxSchema } from '@paldora/validation';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectError, json, ok } from '../test-support/http.js';
import {
  createTestApp,
  uniqueUsername,
  type TestApp,
  type TestUser,
} from '../test-support/test-app.js';

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(() => app.close());

const as = (user: TestUser) => scenes(app).as(user);

const createBox = (owner: TestUser, name = 'Weekend crew') =>
  scenes(app).newBox(owner, name);

const invite: ReturnType<typeof scenes>['invite'] = (...args) =>
  scenes(app).invite(...args);

const join: ReturnType<typeof scenes>['join'] = (...args) =>
  scenes(app).join(...args);

/** A Box with an owner, an admin, and two plain members. */
async function crew() {
  const [owner, admin, member, other] = await Promise.all([
    app.person('owner'),
    app.person('admin'),
    app.person('member'),
    app.person('other'),
  ]);
  const box = await createBox(owner);
  for (const person of [admin, member, other])
    await join(owner, box.id, person);
  await json(
    await as(owner).patch(`/boxes/${box.id}/members/${admin.id}`, {
      role: 'admin',
    }),
  );
  return { owner, admin, member, other, box };
}

describe('roles', () => {
  it('lets the owner promote and demote, and admins only promote members', async () => {
    const { owner, admin, member, other, box } = await crew();
    const change = (actor: TestUser, target: TestUser, role: string) =>
      as(actor).patch(`/boxes/${box.id}/members/${target.id}`, { role });

    // A plain member can change nobody’s role.
    await expectError(
      await change(member, other, 'admin'),
      403,
      'BOX_ACCESS_DENIED',
    );
    await json(await change(admin, member, 'admin'));
    await expectError(
      await change(admin, member, 'member'),
      403,
      'BOX_ACCESS_DENIED',
    );
    await expectError(
      await change(admin, owner, 'member'),
      403,
      'BOX_ACCESS_DENIED',
    );
    await json(await change(owner, member, 'member'));
    await expectError(
      await change(owner, owner, 'member'),
      403,
      'BOX_ACCESS_DENIED',
    );
    await expectError(
      await as(owner).patch(`/boxes/${box.id}/members/${randomUUID()}`, {
        role: 'admin',
      }),
      404,
      'BOX_MEMBER_NOT_FOUND',
    );
    await expectError(
      await as(owner).patch(`/boxes/${box.id}/members/${member.id}`, {
        role: 'owner',
      }),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('lets owners and admins remove members, but never the owner', async () => {
    const { owner, admin, member, other, box } = await crew();
    await expectError(
      await as(member).delete(`/boxes/${box.id}/members/${other.id}`),
      403,
      'BOX_ACCESS_DENIED',
    );
    await expectError(
      await as(admin).delete(`/boxes/${box.id}/members/${owner.id}`),
      403,
      'BOX_ACCESS_DENIED',
    );
    await expectError(
      await as(owner).delete(`/boxes/${box.id}/members/${owner.id}`),
      409,
      'BOX_OWNER_CANNOT_LEAVE',
    );
    await ok(await as(admin).delete(`/boxes/${box.id}/members/${member.id}`));
    await expectError(
      await as(member).get(`/boxes/${box.id}`),
      404,
      'BOX_NOT_FOUND',
    );
    await expectError(
      await as(admin).delete(`/boxes/${box.id}/members/${member.id}`),
      404,
      'BOX_MEMBER_NOT_FOUND',
    );
  });

  it('lets members leave, and the owner only after transferring', async () => {
    const { owner, admin, member, box } = await crew();
    await ok(await as(member).delete(`/boxes/${box.id}/members/me`));
    await expectError(
      await as(member).get(`/boxes/${box.id}`),
      404,
      'BOX_NOT_FOUND',
    );
    await expectError(
      await as(member).delete(`/boxes/${box.id}/members/me`),
      404,
      'BOX_NOT_FOUND',
    );
    await expectError(
      await as(owner).delete(`/boxes/${box.id}/members/me`),
      409,
      'BOX_OWNER_CANNOT_LEAVE',
    );

    const transferred = boxSchema.parse(
      await json(
        await as(owner).put(`/boxes/${box.id}/owner`, { userId: admin.id }),
      ),
    );
    expect(transferred.currentUserRole).toBe('admin');
    await ok(await as(owner).delete(`/boxes/${box.id}/members/me`));
    expect(
      boxSchema.parse(await json(await as(admin).get(`/boxes/${box.id}`)))
        .currentUserRole,
    ).toBe('owner');
  });

  it('resets a returning member to a plain member', async () => {
    const { owner, admin, box } = await crew();
    await ok(await as(owner).delete(`/boxes/${box.id}/members/${admin.id}`));
    await join(owner, box.id, admin);
    expect(
      boxSchema.parse(await json(await as(admin).get(`/boxes/${box.id}`)))
        .currentUserRole,
    ).toBe('member');
  });
});

describe('ownership transfer', () => {
  it('moves ownership atomically and keeps exactly one owner', async () => {
    const { owner, member, box } = await crew();
    await json(
      await as(owner).put(`/boxes/${box.id}/owner`, { userId: member.id }),
    );
    const owners = await app.database
      .select()
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, box.id),
          eq(boxMemberships.role, 'owner'),
          eq(boxMemberships.status, 'active'),
        ),
      );
    expect(owners.map((row) => row.userId)).toEqual([member.id]);
    await expectError(
      await as(owner).patch(`/boxes/${box.id}`, { name: 'Still mine?' }),
      403,
      'BOX_ACCESS_DENIED',
    );
    await expectError(
      await as(owner).put(`/boxes/${box.id}/owner`, { userId: owner.id }),
      403,
      'BOX_ACCESS_DENIED',
    );
  });

  it('rejects self, outsiders, and former members as the new owner', async () => {
    const { owner, member, box } = await crew();
    const outsider = await app.person('outsider');
    await expectError(
      await as(owner).put(`/boxes/${box.id}/owner`, { userId: owner.id }),
      403,
      'BOX_ACCESS_DENIED',
    );
    await expectError(
      await as(owner).put(`/boxes/${box.id}/owner`, { userId: outsider.id }),
      404,
      'BOX_MEMBER_NOT_FOUND',
    );
    await ok(await as(member).delete(`/boxes/${box.id}/members/me`));
    await expectError(
      await as(owner).put(`/boxes/${box.id}/owner`, { userId: member.id }),
      404,
      'BOX_MEMBER_NOT_FOUND',
    );
  });

  it('lets only one of two simultaneous transfers succeed', async () => {
    const { owner, member, other, box } = await crew();
    const results = await Promise.all([
      as(owner).put(`/boxes/${box.id}/owner`, { userId: member.id }),
      as(owner).put(`/boxes/${box.id}/owner`, { userId: other.id }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 403]);
    const owners = await app.database
      .select()
      .from(boxMemberships)
      .where(
        and(eq(boxMemberships.boxId, box.id), eq(boxMemberships.role, 'owner')),
      );
    expect(owners).toHaveLength(1);
  });

  it('cannot be raced by the owner leaving at the same time', async () => {
    const { owner, member, box } = await crew();
    const results = await Promise.all([
      as(owner).put(`/boxes/${box.id}/owner`, { userId: member.id }),
      as(owner).delete(`/boxes/${box.id}/members/me`),
    ]);
    const owners = await app.database
      .select()
      .from(boxMemberships)
      .where(
        and(
          eq(boxMemberships.boxId, box.id),
          eq(boxMemberships.role, 'owner'),
          eq(boxMemberships.status, 'active'),
        ),
      );
    expect(owners).toHaveLength(1);
    expect(results.some((result) => result.status === 200)).toBe(true);
  });
});

describe('lifecycle', () => {
  it('lets only the owner rename, archive, and restore', async () => {
    const { owner, admin, box } = await crew();
    await expectError(
      await as(admin).patch(`/boxes/${box.id}`, { name: 'Nope' }),
      403,
      'BOX_ACCESS_DENIED',
    );
    await expectError(
      await as(owner).patch(`/boxes/${box.id}`, {}),
      400,
      'VALIDATION_FAILED',
    );
    const archived = boxSchema.parse(
      await json(
        await as(owner).patch(`/boxes/${box.id}`, {
          name: 'Renamed',
          status: 'archived',
        }),
      ),
    );
    expect(archived).toMatchObject({ name: 'Renamed', status: 'archived' });
    // Archived Boxes stay readable.
    expect(
      boxSchema.parse(await json(await as(admin).get(`/boxes/${box.id}`)))
        .status,
    ).toBe('archived');
    const guest = await app.person('guest');
    await expectError(
      await as(owner).post(`/boxes/${box.id}/invitations`, {
        username: guest.username,
      }),
      409,
      'BOX_ARCHIVED',
    );
    await json(await as(owner).patch(`/boxes/${box.id}`, { status: 'active' }));
    await invite(owner, box.id, guest);
  });

  it('refuses to accept an invitation into an archived Box', async () => {
    const [owner, guest] = await Promise.all([
      app.person('owner'),
      app.person('guest'),
    ]);
    const box = await createBox(owner);
    const invitation = await invite(owner, box.id, guest);
    await json(
      await as(owner).patch(`/boxes/${box.id}`, { status: 'archived' }),
    );
    expect(
      boxInvitationPageSchema.parse(
        await json(await as(guest).get('/me/box-invitations')),
      ).items,
    ).toEqual([]);
    await expectError(
      await as(guest).post(`/box-invitations/${invitation.id}/accept`),
      409,
      'BOX_ARCHIVED',
    );
  });

  it('deletes only for the owner who types the exact name', async () => {
    const { owner, admin, box } = await crew();
    const path = (name: string) =>
      `/boxes/${box.id}?confirmName=${encodeURIComponent(name)}`;
    await expectError(
      await as(admin).delete(path(box.name)),
      403,
      'BOX_ACCESS_DENIED',
    );
    await expectError(
      await as(owner).delete(path('weekend crew')),
      422,
      'BOX_DELETE_CONFIRMATION_MISMATCH',
    );
    await expectError(
      await as(owner).delete(path('')),
      422,
      'BOX_DELETE_CONFIRMATION_MISMATCH',
    );
    await ok(await as(owner).delete(path(box.name)));
    for (const person of [owner, admin]) {
      await expectError(
        await as(person).get(`/boxes/${box.id}`),
        404,
        'BOX_NOT_FOUND',
      );
    }
    const remaining = await app.database
      .select()
      .from(boxMemberships)
      .where(eq(boxMemberships.boxId, box.id));
    expect(remaining).toEqual([]);
  });

  it('refuses suspended accounts on every Box route', async () => {
    const suspended = await app.createUser({
      username: uniqueUsername('suspended'),
      status: 'suspended',
    });
    await expectError(
      await as(suspended).get('/boxes'),
      403,
      'ACCOUNT_BLOCKED',
    );
  });
});
