import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BoxOwnershipPrototype } from './box-ownership.js';

const projectId = 'demo-paldora';
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error('This test requires the disposable Firestore emulator');
if (process.env.GCLOUD_PROJECT !== projectId)
  throw new Error('This test must run against demo-paldora only');

const app = initializeApp({ projectId });
const db = getFirestore(app);
const boxes = new BoxOwnershipPrototype(db);
const person = () => randomUUID();
const box = () => randomUUID();

beforeAll(() => {
  db.settings({ ignoreUndefinedProperties: false });
});
afterAll(() => deleteApp(app));

function assertOneOwner(
  state: Awaited<ReturnType<BoxOwnershipPrototype['inspect']>>,
) {
  const owners = state.memberships.filter(
    (member) => member.status === 'active' && member.role === 'owner',
  );
  expect(owners).toHaveLength(1);
  expect(owners[0]?.userId).toBe(state.box?.ownerId);
}

describe('Firestore Box ownership prototype', () => {
  it('creates one owner and hides a Box from guesses and removed members', async () => {
    const boxId = box();
    const owner = person();
    const member = person();
    await boxes.create(boxId, owner, 'Book club');
    expect((await boxes.read(boxId, owner))?.name).toBe('Book club');
    expect(await boxes.read(boxId, member)).toBeNull();
    expect(await boxes.read(box(), member)).toBeNull();
    await boxes.addMember(boxId, owner, member);
    expect(await boxes.read(boxId, member)).not.toBeNull();
    await boxes.remove(boxId, owner, member);
    expect(await boxes.read(boxId, member)).toBeNull();
    assertOneOwner(await boxes.inspect(boxId));
  });

  it('transfers ownership atomically', async () => {
    const boxId = box();
    const owner = person();
    const successor = person();
    await boxes.create(boxId, owner, 'Family');
    await boxes.addMember(boxId, owner, successor);
    await boxes.transfer(boxId, owner, successor);
    const state = await boxes.inspect(boxId);
    expect(state.box?.version).toBe(2);
    expect(
      state.memberships.find((member) => member.userId === owner)?.role,
    ).toBe('admin');
    assertOneOwner(state);
    await expect(boxes.remove(boxId, owner, successor)).rejects.toMatchObject({
      code: 'BOX_ACCESS_DENIED',
    });
  });

  it('allows only one of two concurrent transfers from the same owner', async () => {
    const boxId = box();
    const owner = person();
    const first = person();
    const second = person();
    await boxes.create(boxId, owner, 'Crew');
    await boxes.addMember(boxId, owner, first);
    await boxes.addMember(boxId, owner, second);
    const results = await Promise.allSettled([
      boxes.transfer(boxId, owner, first),
      boxes.transfer(boxId, owner, second),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const state = await boxes.inspect(boxId);
    expect(state.box?.version).toBe(2);
    assertOneOwner(state);
  });

  it('serializes removal against a transfer to the same member', async () => {
    const boxId = box();
    const owner = person();
    const target = person();
    await boxes.create(boxId, owner, 'Crew');
    await boxes.addMember(boxId, owner, target);
    const results = await Promise.allSettled([
      boxes.transfer(boxId, owner, target),
      boxes.remove(boxId, owner, target),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    assertOneOwner(await boxes.inspect(boxId));
  });

  it('matches owner and admin role permissions and lets former owners leave', async () => {
    const boxId = box();
    const owner = person();
    const admin = person();
    const member = person();
    await boxes.create(boxId, owner, 'Crew');
    await boxes.addMember(boxId, owner, admin);
    await boxes.addMember(boxId, owner, member);
    await boxes.changeRole(boxId, owner, admin, 'admin');
    await expect(boxes.transfer(boxId, person(), member)).rejects.toMatchObject(
      { code: 'BOX_NOT_FOUND' },
    );
    await expect(
      boxes.changeRole(boxId, admin, admin, 'member'),
    ).rejects.toMatchObject({ code: 'BOX_ACCESS_DENIED' });
    await expect(
      boxes.changeRole(boxId, member, admin, 'member'),
    ).rejects.toMatchObject({ code: 'BOX_ACCESS_DENIED' });
    await expect(boxes.remove(boxId, owner, owner)).rejects.toMatchObject({
      code: 'BOX_OWNER_CANNOT_LEAVE',
    });
    await boxes.changeRole(boxId, owner, admin, 'member');
    await boxes.changeRole(boxId, owner, admin, 'admin');
    await boxes.transfer(boxId, owner, admin);
    await boxes.remove(boxId, owner, owner);
    expect(await boxes.read(boxId, owner)).toBeNull();
    assertOneOwner(await boxes.inspect(boxId));
  });

  it('rejects guessed membership and serializes admin demotion against promotion', async () => {
    const boxId = box();
    const owner = person();
    const admin = person();
    const member = person();
    await boxes.create(boxId, owner, 'Crew');
    await boxes.addMember(boxId, owner, admin);
    await boxes.addMember(boxId, owner, member);
    await boxes.changeRole(boxId, owner, admin, 'admin');
    await expect(
      boxes.changeRole(boxId, person(), member, 'admin'),
    ).rejects.toMatchObject({ code: 'BOX_NOT_FOUND' });
    const results = await Promise.allSettled([
      boxes.changeRole(boxId, owner, admin, 'member'),
      boxes.changeRole(boxId, admin, member, 'admin'),
    ]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    const state = await boxes.inspect(boxId);
    assertOneOwner(state);
    expect(state.memberships.find((row) => row.userId === admin)?.role).toBe(
      'member',
    );
    expect(state.memberships.find((row) => row.userId === member)?.role).toBe(
      results[1]?.status === 'fulfilled' ? 'admin' : 'member',
    );
  });

  it('prevents joining archived Boxes and resets returning members to member', async () => {
    const boxId = box();
    const owner = person();
    const admin = person();
    await boxes.create(boxId, owner, 'Crew');
    await boxes.addMember(boxId, owner, admin);
    await boxes.changeRole(boxId, owner, admin, 'admin');
    await boxes.remove(boxId, owner, admin);
    await boxes.setStatus(boxId, owner, 'archived');
    await expect(boxes.addMember(boxId, owner, admin)).rejects.toMatchObject({
      code: 'BOX_ARCHIVED',
    });
    await boxes.setStatus(boxId, owner, 'active');
    await boxes.addMember(boxId, owner, admin);
    const state = await boxes.inspect(boxId);
    expect(state.memberships.find((row) => row.userId === admin)?.role).toBe(
      'member',
    );
  });
});
