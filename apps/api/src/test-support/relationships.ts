import {
  blockedUserSchema,
  boxInvitationSchema,
  boxSchema,
  friendshipSchema,
} from '@paldora/validation';
import { client, json } from './http.js';
import type { TestApp, TestUser } from './test-app.js';

/** Relationship setup through the same HTTP policy as the operation under test. */
export function relationshipScenes(app: TestApp) {
  const as = (user: TestUser) => client(app, user);

  async function newBox(owner: TestUser, name = 'Crew') {
    return boxSchema.parse(
      await json(await as(owner).post('/boxes', { name }), 201),
    );
  }

  async function join(owner: TestUser, boxId: string, guest: TestUser) {
    const invitation = await invite(owner, boxId, guest);
    await json(
      await as(guest).post(`/box-invitations/${invitation.id}/accept`),
    );
  }

  async function invite(owner: TestUser, boxId: string, guest: TestUser) {
    return boxInvitationSchema.parse(
      await json(
        await as(owner).post(`/boxes/${boxId}/invitations`, {
          username: guest.username,
        }),
        201,
      ),
    );
  }

  async function befriend(first: TestUser, second: TestUser) {
    const sent = friendshipSchema.parse(
      await json(
        await as(first).post('/friend-requests', { username: second.username }),
        201,
      ),
    );
    await json(await as(second).post(`/friend-requests/${sent.id}/accept`));
    return sent.id;
  }

  async function block(blocker: TestUser, target: TestUser) {
    return blockedUserSchema.parse(
      await json(
        await as(blocker).post('/blocks', { username: target.username }),
        201,
      ),
    );
  }

  async function sharedBox(owner: TestUser, ...guests: TestUser[]) {
    const box = await newBox(owner, 'Shared');
    await Promise.all(guests.map((guest) => join(owner, box.id, guest)));
    return box;
  }

  return { as, newBox, join, invite, befriend, block, sharedBox };
}
