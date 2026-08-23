import { randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import {
  createDatabaseConnection,
  mediaAssets,
  profiles,
  users,
  type DatabaseConnection,
} from '@paldora/database';
import type { FriendshipId, UserId } from '@paldora/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BoxService } from '../src/box.service.js';
import type { InfrastructureService } from '../src/infrastructure.service.js';
import { SocialService } from '../src/social.service.js';
import { ProfileAvatarService } from '../src/profile-avatar.service.js';
import { createFakeObjectStorage } from './fake-object-storage.js';
import { createBoxService } from './create-box-service.js';

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('Boxes and social graph flow', () => {
  let connection: DatabaseConnection;
  let boxes: BoxService;
  let social: SocialService;
  const testMarker = randomUUID().replaceAll('-', '').slice(0, 12);
  const subjects = [0, 1, 2].map(
    (index) => `integration-social-${testMarker}-${index}`,
  );
  const usernames = [0, 1, 2].map((index) => `social_${testMarker}_${index}`);
  let userIds: UserId[];

  beforeAll(async () => {
    connection = createDatabaseConnection(databaseUrl as string);
    const infrastructure = {
      databaseClient: connection.database,
    } as unknown as InfrastructureService;
    const avatars = new ProfileAvatarService(
      infrastructure,
      createFakeObjectStorage(),
    );
    boxes = createBoxService(infrastructure, avatars);
    social = new SocialService(infrastructure, avatars);
    const inserted = await connection.database
      .insert(users)
      .values(
        subjects.map((subject) => ({
          authSubject: subject,
          email: `${subject}@example.com`,
          emailNormalized: `${subject}@example.com`,
        })),
      )
      .returning({ id: users.id });
    userIds = inserted.map(({ id }) => id as UserId);
    await connection.database.insert(profiles).values(
      inserted.map(({ id }, index) => ({
        userId: id,
        username: usernames[index],
        usernameNormalized: usernames[index],
        displayName: `Social Friend ${index}`,
        onboardingState: 'complete' as const,
      })),
    );
  });

  afterAll(async () => {
    await connection.pool.query(
      'delete from paldora.boxes where owner_user_id = any($1::uuid[])',
      [userIds],
    );
    await connection.pool.query(
      'delete from paldora.users where auth_subject = any($1::text[])',
      [subjects],
    );
    await connection.close();
  });

  it('runs the mutual friendship and private Box invitation flow', async () => {
    const [owner, friend] = requiredUsers(userIds);
    const request = await social.request(owner, usernames[1] ?? '');
    await social.respond(friend, request.id as FriendshipId, 'accepted');
    const box = await boxes.create(owner, 'Integration circle');
    await expect(
      boxes.update(owner, box.id, {
        name: 'Renamed integration circle',
        status: 'archived',
      }),
    ).resolves.toMatchObject({
      name: 'Renamed integration circle',
      status: 'archived',
    });
    await expect(
      boxes.invite(owner, box.id, usernames[1] ?? ''),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { error: { code: 'BOX_ARCHIVED' } },
    });
    await boxes.update(owner, box.id, { status: 'active' });
    const invitation = await boxes.invite(owner, box.id, usernames[1] ?? '');
    await boxes.respondToInvitation(friend, invitation.id, 'accepted');

    await expect(boxes.list(friend)).resolves.toEqual([
      expect.objectContaining({
        id: box.id,
        currentUserRole: 'member',
        memberCount: 2,
      }),
    ]);
    await expect(social.listFriends(owner)).resolves.toEqual([
      expect.objectContaining({
        user: expect.objectContaining({ id: friend }),
        direction: 'established',
      }),
    ]);

    const avatars = await connection.database
      .insert(mediaAssets)
      .values(
        ['first', 'second'].map((version) => ({
          ownerUserId: friend,
          purpose: 'avatar' as const,
          objectKey: `avatars/${friend}/${version}.webp`,
          contentType: 'image/webp' as const,
          contentLength: 128,
          status: 'ready' as const,
        })),
      )
      .returning({ id: mediaAssets.id, objectKey: mediaAssets.objectKey });
    for (const avatar of avatars) {
      await connection.database
        .update(profiles)
        .set({ avatarMediaId: avatar.id })
        .where(eq(profiles.userId, friend));
      await expect(boxes.members(owner, box.id)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: friend,
            avatarUrl: `signed:${avatar.objectKey}`,
          }),
        ]),
      );
      await expect(social.listFriends(owner)).resolves.toEqual([
        expect.objectContaining({
          user: expect.objectContaining({
            id: friend,
            avatarUrl: `signed:${avatar.objectKey}`,
          }),
        }),
      ]);
    }

    await expect(
      boxes.updateMemberRole(owner, box.id, friend, 'admin'),
    ).resolves.toEqual({ role: 'admin' });
    const third = requiredUsers(userIds)[2];
    await expect(social.listFriends(friend)).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user: expect.objectContaining({ id: third }),
        }),
      ]),
    );
    const secondInvitation = await boxes.invite(
      friend,
      box.id,
      usernames[2] ?? '',
    );
    await expect(boxes.pendingInviteeIds(friend, box.id)).resolves.toEqual({
      inviteeUserIds: [third],
    });
    await boxes.respondToInvitation(third, secondInvitation.id, 'accepted');
    await expect(boxes.pendingInviteeIds(friend, box.id)).resolves.toEqual({
      inviteeUserIds: [],
    });
    await expect(
      boxes.updateMemberRole(friend, box.id, third, 'admin'),
    ).resolves.toEqual({ role: 'admin' });
    await expect(
      boxes.updateMemberRole(third, box.id, friend, 'member'),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    await expect(
      boxes.updateMemberRole(owner, box.id, third, 'member'),
    ).resolves.toEqual({ role: 'member' });
    await expect(
      boxes.removeMember(third, box.id, friend),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    await expect(boxes.removeMember(friend, box.id, third)).resolves.toEqual({
      success: true,
      status: 'removed',
    });
    await expect(
      boxes.transferOwnership(friend, box.id, owner),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    await expect(
      boxes.transferOwnership(owner, box.id, friend),
    ).resolves.toEqual({ ownerUserId: friend });
    await expect(boxes.get(owner, box.id)).resolves.toMatchObject({
      currentUserRole: 'admin',
      ownerUserId: friend,
    });
    await expect(boxes.removeMember(owner, box.id, owner)).resolves.toEqual({
      success: true,
      status: 'left',
    });
    await expect(boxes.get(owner, box.id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    await expect(
      boxes.removeMember(friend, box.id, friend),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
  });

  it('prevents a blocked relationship from accepting a pending invitation', async () => {
    const [owner, , blockedUser] = requiredUsers(userIds);
    const request = await social.request(owner, usernames[2] ?? '');
    await social.respond(blockedUser, request.id, 'accepted');
    const box = await boxes.create(owner, 'Blocking circle');
    const invitation = await boxes.invite(owner, box.id, usernames[2] ?? '');
    await social.block(blockedUser, usernames[0] ?? '');

    await expect(
      boxes.respondToInvitation(blockedUser, invitation.id, 'accepted'),
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      response: {
        error: expect.objectContaining({ code: 'BOX_ACCESS_DENIED' }),
      },
    });
  });

  it('allows only the owner to permanently delete a Box and cascades access', async () => {
    const [owner, friend] = requiredUsers(userIds);
    const box = await boxes.create(owner, 'Disposable circle');
    const invitation = await boxes.invite(owner, box.id, usernames[1] ?? '');
    await boxes.respondToInvitation(friend, invitation.id, 'accepted');

    await expect(boxes.deleteBox(friend, box.id)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
    });
    await expect(boxes.deleteBox(owner, box.id)).resolves.toEqual({
      success: true,
    });
    await expect(boxes.get(owner, box.id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    await expect(boxes.get(friend, box.id)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
    const memberships = await connection.pool.query<{ count: string }>(
      'select count(*) from paldora.box_memberships where box_id = $1',
      [box.id],
    );
    const invitations = await connection.pool.query<{ count: string }>(
      'select count(*) from paldora.box_invitations where box_id = $1',
      [box.id],
    );
    expect(memberships.rows[0]?.count).toBe('0');
    expect(invitations.rows[0]?.count).toBe('0');
  });
});

function requiredUsers(values: UserId[]): [UserId, UserId, UserId] {
  const [first, second, third] = values;
  if (!first || !second || !third) throw new Error('Test users are missing.');
  return [first, second, third];
}
