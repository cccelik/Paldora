import { boxInvitations, boxMemberships, boxes } from '@paldora/database';
import {
  boxInvitationPageSchema,
  boxInvitationSchema,
  boxMemberPageSchema,
  boxPageSchema,
  boxSchema,
} from '@paldora/validation';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, expectError, json, ok } from '../test-support/http.js';
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

const as = (user: TestUser) => client(app, user);

async function createBox(owner: TestUser, name = 'Weekend crew') {
  return boxSchema.parse(
    await json(await as(owner).post('/boxes', { name }), 201),
  );
}

async function invite(owner: TestUser, boxId: string, person: TestUser) {
  return boxInvitationSchema.parse(
    await json(
      await as(owner).post(`/boxes/${boxId}/invitations`, {
        username: person.username,
      }),
      201,
    ),
  );
}

async function join(owner: TestUser, boxId: string, person: TestUser) {
  const invitation = await invite(owner, boxId, person);
  await json(await as(person).post(`/box-invitations/${invitation.id}/accept`));
}

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

describe('creating and reading Boxes', () => {
  it('makes the creator the owner of a private, active Box', async () => {
    const owner = await app.person('owner');
    const box = await createBox(owner, '  Book club  ');
    expect(box).toMatchObject({
      name: 'Book club',
      status: 'active',
      currentUserRole: 'owner',
      memberCount: 1,
    });
    const listed = boxPageSchema.parse(
      await json(await as(owner).get('/boxes')),
    );
    expect(listed.items.map((item) => item.id)).toContain(box.id);
  });

  it('rejects empty, overlong, and unknown fields', async () => {
    const owner = await app.person('owner');
    for (const body of [
      { name: '   ' },
      { name: 'x'.repeat(81) },
      { name: 'ok', status: 'archived' },
    ]) {
      await expectError(
        await as(owner).post('/boxes', body),
        400,
        'VALIDATION_FAILED',
      );
    }
  });

  it('keeps exactly one active owner, even against direct writes', async () => {
    const owner = await app.person('owner');
    const second = await app.person('second');
    const box = await createBox(owner);
    await expect(
      app.database
        .insert(boxMemberships)
        .values({ boxId: box.id, userId: second.id, role: 'owner' }),
    ).rejects.toThrow();
  });

  it('answers non-members, former members, and guesses identically', async () => {
    const { owner, box } = await crew();
    const stranger = await app.person('stranger');
    const attempts = (path: string, method = 'GET', body?: unknown) =>
      app.request(stranger, path, { method, ...(body ? { body } : {}) });
    const guesses = [box.id, randomUUID(), box.id.toUpperCase()];
    for (const id of guesses) {
      await expectError(await attempts(`/boxes/${id}`), 404, 'BOX_NOT_FOUND');
      await expectError(
        await attempts(`/boxes/${id}/members`),
        404,
        'BOX_NOT_FOUND',
      );
      await expectError(
        await attempts(`/boxes/${id}/invitations`),
        404,
        'BOX_NOT_FOUND',
      );
      await expectError(
        await attempts(`/boxes/${id}/invitations`, 'POST', {
          username: owner.username,
        }),
        404,
        'BOX_NOT_FOUND',
      );
      await expectError(
        await attempts(`/boxes/${id}`, 'PATCH', { name: 'Mine now' }),
        404,
        'BOX_NOT_FOUND',
      );
      await expectError(
        await attempts(`/boxes/${id}?confirmName=x`, 'DELETE'),
        404,
        'BOX_NOT_FOUND',
      );
      await expectError(
        await attempts(`/boxes/${id}/members/me`, 'DELETE'),
        404,
        'BOX_NOT_FOUND',
      );
      await expectError(
        await attempts(`/boxes/${id}/owner`, 'PUT', { userId: stranger.id }),
        404,
        'BOX_NOT_FOUND',
      );
    }
    const [row] = await app.database
      .select()
      .from(boxes)
      .where(eq(boxes.id, box.id));
    expect(row?.name).toBe('Weekend crew');
  });

  it('pages through a person’s Boxes', async () => {
    const owner = await app.person('owner');
    const made = [];
    for (let index = 0; index < 3; index += 1) {
      // Sequential so membership timestamps differ.
      made.push(await createBox(owner, `Box ${index}`));
    }
    const first = boxPageSchema.parse(
      await json(await as(owner).get('/boxes?limit=2')),
    );
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = boxPageSchema.parse(
      await json(
        await as(owner).get(`/boxes?limit=2&cursor=${first.nextCursor}`),
      ),
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.items, ...second.items].map((box) => box.id)),
    ).toEqual(new Set(made.map((box) => box.id)));
  });
});

describe('invitations', () => {
  it('invites anyone by username, with no friendship needed', async () => {
    const [owner, guest] = await Promise.all([
      app.person('owner'),
      app.person('guest'),
    ]);
    const box = await createBox(owner);
    const invitation = await invite(owner, box.id, guest);
    expect(invitation.box).toEqual({ id: box.id, name: box.name });

    await expectError(
      await as(guest).get(`/boxes/${box.id}`),
      404,
      'BOX_NOT_FOUND',
    );
    const mine = boxInvitationPageSchema.parse(
      await json(await as(guest).get('/me/box-invitations')),
    );
    expect(mine.items.map((item) => item.id)).toEqual([invitation.id]);
    expect(mine.items[0]?.inviter.id).toBe(owner.id);

    const joined = boxSchema.parse(
      await json(
        await as(guest).post(`/box-invitations/${invitation.id}/accept`),
      ),
    );
    expect(joined).toMatchObject({ currentUserRole: 'member', memberCount: 2 });
    const members = boxMemberPageSchema.parse(
      await json(await as(owner).get(`/boxes/${box.id}/members`)),
    );
    expect(members.items.map((item) => item.user.id)).toEqual([
      owner.id,
      guest.id,
    ]);
    expect(members.items.map((item) => item.role)).toEqual(['owner', 'member']);
  });

  it('refuses invalid targets with stable codes', async () => {
    const [owner, guest] = await Promise.all([
      app.person('owner'),
      app.person('guest'),
    ]);
    const box = await createBox(owner);
    const send = (username: string) =>
      as(owner).post(`/boxes/${box.id}/invitations`, { username });
    await expectError(await send(owner.username), 400, 'CANNOT_INVITE_SELF');
    await expectError(await send('no_such_person_xyz'), 404, 'USER_NOT_FOUND');
    await invite(owner, box.id, guest);
    await expectError(
      await send(guest.username),
      409,
      'INVITATION_ALREADY_PENDING',
    );
    const [pending] = boxInvitationPageSchema.parse(
      await json(await as(guest).get('/me/box-invitations')),
    ).items;
    await json(await as(guest).post(`/box-invitations/${pending?.id}/accept`));
    await expectError(await send(guest.username), 409, 'ALREADY_BOX_MEMBER');
  });

  it('can be declined or withdrawn, and only once', async () => {
    const [owner, guest, other] = await Promise.all([
      app.person('owner'),
      app.person('guest'),
      app.person('other'),
    ]);
    const box = await createBox(owner);
    const first = await invite(owner, box.id, guest);
    await ok(await as(guest).post(`/box-invitations/${first.id}/decline`));
    await expectError(
      await as(guest).post(`/box-invitations/${first.id}/accept`),
      404,
      'INVITATION_NOT_FOUND',
    );

    const second = await invite(owner, box.id, guest);
    await ok(
      await as(owner).delete(`/boxes/${box.id}/invitations/${second.id}`),
    );
    await expectError(
      await as(guest).post(`/box-invitations/${second.id}/accept`),
      404,
      'INVITATION_NOT_FOUND',
    );
    await expectError(
      await as(owner).delete(`/boxes/${box.id}/invitations/${second.id}`),
      404,
      'INVITATION_NOT_FOUND',
    );

    const third = await invite(owner, box.id, other);
    // Someone else’s invitation looks like a missing one.
    await expectError(
      await as(guest).post(`/box-invitations/${third.id}/accept`),
      404,
      'INVITATION_NOT_FOUND',
    );
    await expectError(
      await as(guest).post(`/box-invitations/${third.id}/decline`),
      404,
      'INVITATION_NOT_FOUND',
    );
  });

  it('lets only one of two simultaneous acceptances join', async () => {
    const [owner, guest] = await Promise.all([
      app.person('owner'),
      app.person('guest'),
    ]);
    const box = await createBox(owner);
    const invitation = await invite(owner, box.id, guest);
    const results = await Promise.all([
      as(guest).post(`/box-invitations/${invitation.id}/accept`),
      as(guest).post(`/box-invitations/${invitation.id}/accept`),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 404]);
  });

  it('expires after seven days and can then be re-sent', async () => {
    const [owner, guest] = await Promise.all([
      app.person('owner'),
      app.person('guest'),
    ]);
    const box = await createBox(owner);
    const invitation = await invite(owner, box.id, guest);
    await app.database
      .update(boxInvitations)
      .set({ expiresAt: sql`now() - interval '1 minute'` })
      .where(eq(boxInvitations.id, invitation.id));
    expect(
      boxInvitationPageSchema.parse(
        await json(await as(guest).get('/me/box-invitations')),
      ).items,
    ).toEqual([]);
    await expectError(
      await as(guest).post(`/box-invitations/${invitation.id}/accept`),
      410,
      'INVITATION_EXPIRED',
    );
    const [stored] = await app.database
      .select()
      .from(boxInvitations)
      .where(eq(boxInvitations.id, invitation.id));
    expect(stored?.status).toBe('expired');
    await invite(owner, box.id, guest);
  });

  it('is only listed to owners and admins', async () => {
    const { owner, admin, member, box } = await crew();
    const guest = await app.person('guest');
    await invite(owner, box.id, guest);
    for (const manager of [owner, admin]) {
      const page = boxInvitationPageSchema.parse(
        await json(await as(manager).get(`/boxes/${box.id}/invitations`)),
      );
      expect(page.items.map((item) => item.invitee.id)).toEqual([guest.id]);
    }
    await expectError(
      await as(member).get(`/boxes/${box.id}/invitations`),
      403,
      'BOX_ACCESS_DENIED',
    );
    await expectError(
      await as(member).post(`/boxes/${box.id}/invitations`, {
        username: guest.username,
      }),
      403,
      'BOX_ACCESS_DENIED',
    );
  });
});

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
