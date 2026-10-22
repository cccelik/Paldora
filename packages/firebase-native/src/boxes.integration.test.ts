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
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBox, getBox, listMyBoxIds } from './boxes.js';

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
});
