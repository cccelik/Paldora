import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  changeBoxMemberRole,
  createBox,
  getBox,
  leaveBox,
  listMyBoxIds,
  removeBoxMember,
  transferBoxOwnership,
  updateBoxSettings,
} from './boxes.js';

if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error('This test requires the disposable Firestore emulator');
if (process.env.GCLOUD_PROJECT !== 'demo-paldora')
  throw new Error('This test must run against demo-paldora only');

let env: RulesTestEnvironment;
const person = () => randomUUID();
const box = () => randomUUID();

function clientDb(context: RulesTestContext): Firestore {
  // rules-unit-testing exposes the compat SDK; its delegate is the modular
  // Firestore instance used by the app repository and retains the mock auth.
  return (context.firestore() as unknown as { _delegate: Firestore })._delegate;
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-paldora',
    firestore: {
      rules: readFileSync(
        new URL('../../../firebase/firestore.native.rules', import.meta.url),
        'utf8',
      ),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

async function account(uid: string, status: 'active' | 'suspended' = 'active') {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(clientDb(context), 'nativeAccounts', uid), { status });
  });
}

describe('Firebase-native Box access', () => {
  it('lets the owner rename, archive, and reopen while closing member changes during archive', async () => {
    const alice = person();
    const bob = person();
    const boxId = box();
    await account(alice);
    await account(bob);
    const aliceDb = clientDb(env.authenticatedContext(alice));
    const bobDb = clientDb(env.authenticatedContext(bob));
    await createBox(aliceDb, alice, 'Original', boxId);
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(clientDb(context), 'nativeBoxes', boxId, 'members', bob),
        {
          uid: bob,
          role: 'member',
          status: 'active',
        },
      );
    });
    await assertFails(updateBoxSettings(bobDb, boxId, { name: 'Stolen' }));
    await assertFails(
      updateDoc(doc(aliceDb, 'nativeBoxes', boxId), {
        ownerUid: bob,
        name: 'Forged',
        version: 2,
      }),
    );
    await assertSucceeds(
      updateBoxSettings(aliceDb, boxId, {
        name: 'Renamed',
        status: 'archived',
      }),
    );
    expect(await getBox(bobDb, boxId)).toMatchObject({
      name: 'Renamed',
      status: 'archived',
      version: 2,
    });
    await assertFails(changeBoxMemberRole(aliceDb, boxId, bob, 'admin'));
    await assertFails(leaveBox(bobDb, boxId, bob));
    await expect(
      transferBoxOwnership(aliceDb, boxId, alice, bob),
    ).rejects.toThrow();
    await assertSucceeds(
      updateBoxSettings(aliceDb, boxId, { status: 'active' }),
    );
    await assertSucceeds(changeBoxMemberRole(aliceDb, boxId, bob, 'admin'));
  });
  it('matches role and removal policy and revokes reads after leaving', async () => {
    const alice = person();
    const bob = person();
    const carol = person();
    const boxId = box();
    for (const uid of [alice, bob, carol]) await account(uid);
    const aliceDb = clientDb(env.authenticatedContext(alice));
    const bobDb = clientDb(env.authenticatedContext(bob));
    const carolDb = clientDb(env.authenticatedContext(carol));
    await createBox(aliceDb, alice, 'Crew', boxId);
    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = clientDb(context);
      for (const uid of [bob, carol]) {
        await setDoc(doc(adminDb, 'nativeBoxes', boxId, 'members', uid), {
          uid,
          role: 'member',
          status: 'active',
        });
      }
    });
    await assertFails(changeBoxMemberRole(bobDb, boxId, carol, 'admin'));
    await assertFails(removeBoxMember(bobDb, boxId, carol));
    await assertFails(leaveBox(aliceDb, boxId, alice));
    await assertSucceeds(changeBoxMemberRole(aliceDb, boxId, bob, 'admin'));
    await assertSucceeds(changeBoxMemberRole(bobDb, boxId, carol, 'admin'));
    await assertFails(changeBoxMemberRole(bobDb, boxId, carol, 'member'));
    await assertSucceeds(changeBoxMemberRole(aliceDb, boxId, carol, 'member'));
    await assertSucceeds(removeBoxMember(bobDb, boxId, carol));
    await assertFails(getBox(carolDb, boxId));
    await assertFails(changeBoxMemberRole(carolDb, boxId, bob, 'member'));
    await assertFails(removeBoxMember(bobDb, boxId, alice));
    await assertSucceeds(leaveBox(bobDb, boxId, bob));
    await assertFails(getBox(bobDb, boxId));
  });
  it('transfers to an active member atomically and rejects partial or stale transfers', async () => {
    const alice = person();
    const bob = person();
    const carol = person();
    const boxId = box();
    for (const uid of [alice, bob, carol]) await account(uid);
    const aliceDb = clientDb(env.authenticatedContext(alice));
    const bobDb = clientDb(env.authenticatedContext(bob));
    const boxRef = doc(aliceDb, 'nativeBoxes', boxId);
    await createBox(aliceDb, alice, 'Crew', boxId);
    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = clientDb(context);
      for (const uid of [bob, carol]) {
        await setDoc(doc(adminDb, 'nativeBoxes', boxId, 'members', uid), {
          uid,
          role: 'member',
          status: 'active',
        });
      }
    });
    await assertFails(updateDoc(boxRef, { ownerUid: bob, version: 2 }));
    await assertFails(
      updateDoc(doc(aliceDb, 'nativeBoxes', boxId, 'members', bob), {
        role: 'owner',
      }),
    );
    await assertSucceeds(transferBoxOwnership(aliceDb, boxId, alice, bob));
    expect(await getBox(aliceDb, boxId)).toMatchObject({
      ownerUid: bob,
      version: 2,
    });
    expect(
      (
        await getDoc(doc(aliceDb, 'nativeBoxes', boxId, 'members', alice))
      ).data()?.role,
    ).toBe('admin');
    expect(
      (await getDoc(doc(bobDb, 'nativeBoxes', boxId, 'members', bob))).data()
        ?.role,
    ).toBe('owner');
    await expect(
      transferBoxOwnership(aliceDb, boxId, alice, carol),
    ).rejects.toThrow();
    await assertFails(
      updateDoc(doc(bobDb, 'nativeBoxes', boxId), {
        ownerUid: carol,
        version: 3,
      }),
    );
  });

  it('allows only one successor when two owner transfers race', async () => {
    const alice = person();
    const bob = person();
    const carol = person();
    const boxId = box();
    for (const uid of [alice, bob, carol]) await account(uid);
    const aliceDb = clientDb(env.authenticatedContext(alice));
    await createBox(aliceDb, alice, 'Race', boxId);
    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = clientDb(context);
      for (const uid of [bob, carol]) {
        await setDoc(doc(adminDb, 'nativeBoxes', boxId, 'members', uid), {
          uid,
          role: 'member',
          status: 'active',
        });
      }
    });
    const outcomes = await Promise.allSettled([
      transferBoxOwnership(aliceDb, boxId, alice, bob),
      transferBoxOwnership(aliceDb, boxId, alice, carol),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    const finalBox = await getBox(aliceDb, boxId);
    expect(finalBox?.version).toBe(2);
    expect([bob, carol]).toContain(finalBox?.ownerUid);
  });

  it('will not transfer ownership to a suspended member', async () => {
    const alice = person();
    const bob = person();
    const boxId = box();
    await account(alice);
    await account(bob, 'suspended');
    const aliceDb = clientDb(env.authenticatedContext(alice));
    await createBox(aliceDb, alice, 'Crew', boxId);
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(clientDb(context), 'nativeBoxes', boxId, 'members', bob),
        {
          uid: bob,
          role: 'member',
          status: 'active',
        },
      );
    });
    await assertFails(transferBoxOwnership(aliceDb, boxId, alice, bob));
  });

  it('serializes removal against transfer to the same member', async () => {
    const alice = person();
    const bob = person();
    const boxId = box();
    await account(alice);
    await account(bob);
    const aliceDb = clientDb(env.authenticatedContext(alice));
    await createBox(aliceDb, alice, 'Race', boxId);
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(clientDb(context), 'nativeBoxes', boxId, 'members', bob),
        {
          uid: bob,
          role: 'member',
          status: 'active',
        },
      );
    });
    const outcomes = await Promise.allSettled([
      transferBoxOwnership(aliceDb, boxId, alice, bob),
      removeBoxMember(aliceDb, boxId, bob),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    const finalBox = await getBox(aliceDb, boxId);
    const finalMember = await getDoc(
      doc(aliceDb, 'nativeBoxes', boxId, 'members', bob),
    );
    if (finalBox?.ownerUid === bob) {
      expect(finalMember.data()).toMatchObject({
        role: 'owner',
        status: 'active',
      });
    } else {
      expect(finalBox?.ownerUid).toBe(alice);
      expect(finalMember.data()).toMatchObject({
        role: 'member',
        status: 'removed',
      });
    }
  });
  it('creates an owned Box atomically and lists only its private ID hint', async () => {
    const alice = person();
    const bob = person();
    const boxId = box();
    await account(alice);
    await account(bob);
    const aliceDb = clientDb(env.authenticatedContext(alice));
    const bobDb = clientDb(env.authenticatedContext(bob));
    await assertSucceeds(createBox(aliceDb, alice, 'Book club', boxId));
    expect(await getBox(aliceDb, boxId)).toMatchObject({
      ownerUid: alice,
      name: 'Book club',
    });
    expect(await listMyBoxIds(aliceDb, alice)).toContain(boxId);
    await assertFails(getBox(bobDb, boxId));
    await assertFails(listMyBoxIds(bobDb, alice));
    await assertFails(getBox(clientDb(env.unauthenticatedContext()), boxId));
    await assertFails(getDocs(collection(aliceDb, 'nativeBoxes')));
  });

  it('rejects partial or forged Box creation and disallows client role changes', async () => {
    const alice = person();
    const bob = person();
    const boxId = box();
    await account(alice);
    await account(bob);
    const aliceDb = clientDb(env.authenticatedContext(alice));
    const bobDb = clientDb(env.authenticatedContext(bob));
    await assertFails(
      setDoc(doc(aliceDb, 'nativeBoxes', boxId), {
        id: boxId,
        name: 'Forged',
        ownerUid: alice,
        status: 'active',
        version: 1,
      }),
    );
    await assertFails(
      setDoc(doc(bobDb, 'nativeBoxes', boxId, 'members', bob), {
        uid: bob,
        role: 'owner',
        status: 'active',
      }),
    );
    await assertFails(createBox(bobDb, alice, 'Stolen', box()));
    await createBox(aliceDb, alice, 'Real', boxId);
    await assertFails(
      setDoc(doc(aliceDb, 'nativeBoxes', boxId, 'members', alice), {
        uid: alice,
        role: 'member',
        status: 'active',
      }),
    );
    await assertFails(
      setDoc(doc(aliceDb, 'nativeBoxes', boxId), {
        id: boxId,
        name: 'Changed',
        ownerUid: alice,
        status: 'active',
        version: 1,
      }),
    );
  });

  it('closes reads immediately when the account is suspended', async () => {
    const alice = person();
    const boxId = box();
    await account(alice);
    const aliceDb = clientDb(env.authenticatedContext(alice));
    await createBox(aliceDb, alice, 'Crew', boxId);
    await account(alice, 'suspended');
    await assertFails(getDoc(doc(aliceDb, 'nativeBoxes', boxId)));
    await assertFails(listMyBoxIds(aliceDb, alice));
    await assertFails(createBox(aliceDb, alice, 'Another', box()));
  });

  it('rechecks live membership even when a private Box-ID hint is stale', async () => {
    const alice = person();
    const bob = person();
    const boxId = box();
    await account(alice);
    await account(bob);
    const aliceDb = clientDb(env.authenticatedContext(alice));
    const bobDb = clientDb(env.authenticatedContext(bob));
    await createBox(aliceDb, alice, 'Crew', boxId);
    await env.withSecurityRulesDisabled(async (context) => {
      const adminDb = clientDb(context);
      await setDoc(doc(adminDb, 'nativeBoxes', boxId, 'members', bob), {
        uid: bob,
        role: 'member',
        status: 'active',
      });
      await setDoc(doc(adminDb, 'nativeAccounts', bob, 'boxRefs', boxId), {
        boxId,
      });
    });
    expect((await getBox(bobDb, boxId))?.id).toBe(boxId);
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(clientDb(context), 'nativeBoxes', boxId, 'members', bob),
        {
          uid: bob,
          role: 'member',
          status: 'removed',
        },
      );
    });
    expect(await listMyBoxIds(bobDb, bob)).toContain(boxId);
    await assertFails(getBox(bobDb, boxId));
  });

  it('does not let an Auth user provision their own active account', async () => {
    const alice = person();
    const aliceDb = clientDb(env.authenticatedContext(alice));
    await assertFails(
      setDoc(doc(aliceDb, 'nativeAccounts', alice), { status: 'active' }),
    );
    await assertFails(createBox(aliceDb, alice, 'Crew', box()));
  });

  it('keeps invitation and block documents behind trusted code', async () => {
    const alice = person();
    const aliceDb = clientDb(env.authenticatedContext(alice));
    await account(alice);
    await assertFails(getDoc(doc(aliceDb, 'nativeBoxInvitations', box())));
    await assertFails(
      setDoc(doc(aliceDb, 'nativeBoxInvitations', box()), {
        status: 'pending',
      }),
    );
    await assertFails(getDoc(doc(aliceDb, 'nativeBlockPairs', box())));
    await assertFails(
      setDoc(doc(aliceDb, 'nativeBlockPairs', box()), { blockedBy: [alice] }),
    );
    await assertFails(getDoc(doc(aliceDb, 'nativeUsernames', 'zoe')));
    await assertFails(
      setDoc(doc(aliceDb, 'nativeUsernames', 'zoe'), { uid: alice }),
    );
  });
});
