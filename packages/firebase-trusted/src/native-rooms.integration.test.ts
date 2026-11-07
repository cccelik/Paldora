import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_WIDGETS } from '@paldora/domain';
import { NativeAccounts } from './native-accounts.js';
import { NativeBoxes } from './native-boxes.js';
import { nativeBlockPairId } from './native-box-invitations.js';
import { NativeRooms, personalizationFlagsFromEnv } from './native-rooms.js';

if (
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.GCLOUD_PROJECT !== 'demo-paldora'
)
  throw new Error('Disposable Firebase emulators required');

const app = initializeApp(
  { projectId: 'demo-paldora' },
  `rooms-${randomUUID()}`,
);
const auth = getAuth(app);
const db = getFirestore(app);
const accounts = new NativeAccounts(db, auth);
const boxes = new NativeBoxes(db);
const rooms = new NativeRooms(db, {
  personalizationCss: true,
  personalizationWidgets: true,
});
afterAll(() => deleteApp(app));

async function person(username: string) {
  const uid = randomUUID();
  await auth.createUser({
    uid,
    email: `${uid}@example.invalid`,
    emailVerified: true,
  });
  await auth.setCustomUserClaims(uid, { paldoraAdmitted: true });
  await accounts.provision(uid);
  await db
    .collection('nativeAccounts')
    .doc(uid)
    .update({ username, usernameNormalized: username });
  await db.collection('nativeUsernames').doc(username).set({ uid });
  await db
    .collection('nativeProfiles')
    .doc(uid)
    .update({ displayName: username });
  return uid;
}

describe('trusted Room policy and versioned writes', () => {
  it('hides default Rooms, allows friends, and rechecks block and shared-Box access', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const viewer = await person(`viewer${randomUUID().slice(0, 8)}`);
    const outsider = await person(`outside${randomUUID().slice(0, 8)}`);
    const ownerName = (
      await db.collection('nativeAccounts').doc(owner).get()
    ).get('username') as string;
    expect(await rooms.get(owner)).toMatchObject({
      relationship: 'owner',
      visibility: 'friends',
      updatedAt: null,
    });
    await expect(rooms.get(viewer, ownerName)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    const pairId = nativeBlockPairId(owner, viewer);
    await db
      .collection('nativeFriendPairs')
      .doc(pairId)
      .set({ users: [owner, viewer].sort(), status: 'accepted' });
    expect(await rooms.get(viewer, ownerName)).toMatchObject({
      relationship: 'friend',
      visibility: null,
      updatedAt: null,
    });
    await db
      .collection('nativeBlockPairs')
      .doc(pairId)
      .set({ blockedBy: [viewer], epoch: 1 });
    await expect(rooms.get(viewer, ownerName)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await db.collection('nativeBlockPairs').doc(pairId).delete();

    const first = await rooms.update(owner, {
      visibility: 'members',
      expectedUpdatedAt: null,
    });
    expect(first.visibility).toBe('members');
    const box = await boxes.create(owner, 'Shared');
    const boxRef = db.collection('nativeBoxes').doc(box.id);
    await boxRef
      .collection('members')
      .doc(outsider)
      .set({ uid: outsider, status: 'active', role: 'member' });
    await db
      .collection('nativeAccounts')
      .doc(outsider)
      .collection('boxRefs')
      .doc(box.id)
      .set({ boxId: box.id });
    expect((await rooms.get(outsider, ownerName)).relationship).toBe('member');
    await boxRef
      .collection('members')
      .doc(outsider)
      .update({ status: 'removed' });
    await expect(rooms.get(outsider, ownerName)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await rooms.update(owner, {
      visibility: 'hidden',
      expectedUpdatedAt: first.updatedAt,
    });
    await expect(rooms.get(viewer, ownerName)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('finds a shared Box beyond the first page of hints, and ignores one the owner left', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const viewer = await person(`viewer${randomUUID().slice(0, 8)}`);
    const ownerName = (
      await db.collection('nativeAccounts').doc(owner).get()
    ).get('username') as string;
    await rooms.update(owner, {
      visibility: 'members',
      expectedUpdatedAt: null,
    });
    const refs = db
      .collection('nativeAccounts')
      .doc(viewer)
      .collection('boxRefs');
    // 50 stale hints sort before the real shared Box, so it is the 51st hint.
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        refs.doc(`-decoy-${String(i).padStart(2, '0')}`).set({ boxId: 'x' }),
      ),
    );
    const box = await boxes.create(owner, 'Late');
    const boxRef = db.collection('nativeBoxes').doc(box.id);
    await boxRef
      .collection('members')
      .doc(viewer)
      .set({ uid: viewer, status: 'active', role: 'member' });
    await refs.doc(box.id).set({ boxId: box.id });
    expect((await rooms.get(viewer, ownerName)).relationship).toBe('member');
    await boxRef.collection('members').doc(owner).update({ status: 'removed' });
    await expect(rooms.get(viewer, ownerName)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });

  it('uses one stale version across settings, widgets, Top Friends and safe personalization', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const friend = await person(`friend${randomUUID().slice(0, 8)}`);
    const pairId = nativeBlockPairId(owner, friend);
    await db
      .collection('nativeFriendPairs')
      .doc(pairId)
      .set({ users: [owner, friend].sort(), status: 'accepted' });
    const first = await rooms.update(owner, {
      themePreset: 'obsidian_gold',
      expectedUpdatedAt: null,
    });
    expect(first.style.themePreset).toBe('obsidian_gold');
    await expect(
      rooms.update(owner, { visibility: 'hidden', expectedUpdatedAt: null }),
    ).rejects.toMatchObject({ code: 'STALE' });
    const widgets = DEFAULT_ROOM_WIDGETS.map((widget) => ({
      ...widget,
      enabled: widget.type !== 'photos',
    }));
    const second = await rooms.updateWidgets(owner, {
      widgets,
      expectedUpdatedAt: first.updatedAt,
    });
    expect(
      second.widgets.find((widget) => widget.type === 'photos')?.enabled,
    ).toBe(false);
    const third = await rooms.updateTopFriends(owner, {
      userIds: [friend],
      size: 4,
      visibility: 'visible',
      expectedUpdatedAt: second.updatedAt,
    });
    expect(third.topFriends.items?.map((item) => item.id)).toEqual([friend]);
    await expect(
      rooms.updateTopFriends(owner, {
        userIds: [randomUUID()],
        size: 4,
        visibility: 'visible',
        expectedUpdatedAt: third.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'FRIEND_INELIGIBLE' });
    const fourth = await rooms.updatePersonalization(owner, {
      cssSource: '.room-title { font-weight: 700 }',
      widgets: [{ title: 'Hello', source: '<p>Safe</p>' }],
      expectedUpdatedAt: third.updatedAt,
    });
    expect(fourth.updatedAt).not.toBe(third.updatedAt);
    const ownerName = fourth.owner.username;
    expect(
      (await rooms.personalizationRendered(owner, ownerName)).css,
    ).toContain('font-weight');
    await expect(
      rooms.updatePersonalization(owner, {
        cssSource: 'body { background: red }',
        widgets: [],
        expectedUpdatedAt: fourth.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect((await rooms.personalizationSource(owner)).widgets).toHaveLength(1);
  });
  it('lets exactly one of two concurrent writes with the same expectedUpdatedAt win', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const base = await rooms.update(owner, {
      visibility: 'members',
      expectedUpdatedAt: null,
    });
    const results = await Promise.allSettled([
      rooms.update(owner, {
        location: 'Paris',
        expectedUpdatedAt: base.updatedAt,
      }),
      rooms.update(owner, {
        currently: 'Reading',
        expectedUpdatedAt: base.updatedAt,
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected');
    expect(lost).toMatchObject({ reason: { code: 'STALE' } });
    const final = await rooms.get(owner);
    expect([final.location, final.currently].filter(Boolean)).toHaveLength(1);
  });

  it('treats a stale write that changes nothing as an idempotent success', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const first = await rooms.update(owner, {
      location: 'Paris',
      expectedUpdatedAt: null,
    });
    await rooms.update(owner, {
      currently: 'Reading',
      expectedUpdatedAt: first.updatedAt,
    });
    // No-op against current state (e.g. a retried request) succeeds without a
    // version bump, even with a stale token; any real change is still STALE.
    const retry = await rooms.update(owner, {
      location: 'Paris',
      expectedUpdatedAt: first.updatedAt,
    });
    expect(retry.currently).toBe('Reading');
    await expect(
      rooms.update(owner, {
        location: 'Rome',
        expectedUpdatedAt: first.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'STALE' });
  });

  it('does not attach banner media on a stale write', async () => {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const first = await rooms.update(owner, {
      location: 'Paris',
      expectedUpdatedAt: null,
    });
    await rooms.update(owner, {
      currently: 'Reading',
      expectedUpdatedAt: first.updatedAt,
    });
    const assetId = randomUUID();
    const assetRef = db.collection('nativeMediaAssets').doc(assetId);
    await assetRef.set({
      status: 'ready',
      purpose: 'room_banner',
      ownerUid: owner,
      attachedRoomUid: null,
    });
    await expect(
      rooms.update(owner, {
        bannerMediaId: assetId,
        expectedUpdatedAt: first.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'STALE' });
    expect((await assetRef.get()).get('attachedRoomUid')).toBeNull();
  });
});

describe('personalization kill switches (ADR 018)', () => {
  const stored = {
    cssSource: '.room-title { font-weight: 700 }',
    widgets: [{ title: 'Hello', source: '<p>Safe</p>' }],
  };
  const on = { personalizationCss: true, personalizationWidgets: true };
  const matrix = [
    {
      name: 'css only',
      flags: { personalizationCss: true },
      css: true,
      widgets: false,
    },
    {
      name: 'widgets only',
      flags: { personalizationWidgets: true },
      css: false,
      widgets: true,
    },
    { name: 'both on', flags: on, css: true, widgets: true },
    { name: 'both off', flags: {}, css: false, widgets: false },
  ];

  async function scene() {
    const owner = await person(`owner${randomUUID().slice(0, 8)}`);
    const friend = await person(`friend${randomUUID().slice(0, 8)}`);
    await db
      .collection('nativeFriendPairs')
      .doc(nativeBlockPairId(owner, friend))
      .set({ users: [owner, friend].sort(), status: 'accepted' });
    const ownerName = (
      await db.collection('nativeAccounts').doc(owner).get()
    ).get('username') as string;
    const saved = await new NativeRooms(db, on).updatePersonalization(owner, {
      ...stored,
      expectedUpdatedAt: null,
    });
    return { owner, friend, ownerName, version: saved.updatedAt };
  }

  it('reads the flags only from the exact value 1', () => {
    expect(personalizationFlagsFromEnv({})).toEqual({
      personalizationCss: false,
      personalizationWidgets: false,
    });
    expect(
      personalizationFlagsFromEnv({
        PALDORA_PERSONALIZATION_CSS: 'true',
        PALDORA_PERSONALIZATION_WIDGETS: '1',
      }),
    ).toEqual({ personalizationCss: false, personalizationWidgets: true });
  });

  it('defaults to both surfaces off', async () => {
    const { owner } = await scene();
    expect(
      await new NativeRooms(db).personalizationSource(owner),
    ).toMatchObject({ cssEnabled: false, widgetsEnabled: false });
  });

  for (const { name, flags, css, widgets } of matrix) {
    it(`${name}: renders per surface for owner and visitor, keeps owner source`, async () => {
      const { owner, friend, ownerName } = await scene();
      const service = new NativeRooms(db, flags);
      for (const viewer of [owner, friend]) {
        const rendered = await service.personalizationRendered(
          viewer,
          ownerName,
        );
        expect(rendered.css !== '').toBe(css);
        expect(rendered.widgets.length).toBe(widgets ? 1 : 0);
      }
      const source = await service.personalizationSource(owner);
      expect(source).toMatchObject({
        ...stored,
        cssEnabled: css,
        widgetsEnabled: widgets,
      });
    });

    it(`${name}: rejects writes that change a disabled surface, with no state change`, async () => {
      const { owner, version } = await scene();
      const service = new NativeRooms(db, flags);
      const attempt = (changes: Partial<typeof stored>) =>
        service.updatePersonalization(owner, {
          ...stored,
          ...changes,
          expectedUpdatedAt: version,
        });
      const cssChange = { cssSource: '.room-text { font-weight: 600 }' };
      const widgetChange = {
        widgets: [{ title: 'New', source: '<p>New</p>' }],
      };
      if (css) await attempt(cssChange);
      else
        await expect(attempt(cssChange)).rejects.toMatchObject({
          code: 'INVALID',
        });
      const afterCss = await service.personalizationSource(owner);
      expect(afterCss.cssSource).toBe(
        css ? cssChange.cssSource : stored.cssSource,
      );
      const current = (await service.get(owner)).updatedAt;
      const next = (changes: Partial<typeof stored>) =>
        service.updatePersonalization(owner, {
          cssSource: afterCss.cssSource,
          widgets: afterCss.widgets,
          ...changes,
          expectedUpdatedAt: current,
        });
      if (widgets) await next(widgetChange);
      else
        await expect(next(widgetChange)).rejects.toMatchObject({
          code: 'INVALID',
        });
      const after = await service.personalizationSource(owner);
      expect(after.widgets).toEqual(
        widgets ? widgetChange.widgets : stored.widgets,
      );
      if (!css && !widgets)
        expect((await service.get(owner)).updatedAt).toBe(current);
    });
  }

  it('lets a disabled surface be resubmitted unchanged while the other changes', async () => {
    const { owner, version } = await scene();
    const service = new NativeRooms(db, { personalizationWidgets: true });
    const saved = await service.updatePersonalization(owner, {
      cssSource: stored.cssSource,
      widgets: [{ title: 'Edited', source: '<p>Edited</p>' }],
      expectedUpdatedAt: version,
    });
    expect(saved.updatedAt).not.toBe(version);
    const source = await service.personalizationSource(owner);
    expect(source.cssSource).toBe(stored.cssSource);
    expect(source.widgets[0]?.title).toBe('Edited');
  });

  it('never deletes stored source when a switch flips off and back on', async () => {
    const { owner, friend, ownerName } = await scene();
    expect(
      await new NativeRooms(db).personalizationRendered(friend, ownerName),
    ).toEqual({ css: '', widgets: [] });
    const again = await new NativeRooms(db, on).personalizationRendered(
      friend,
      ownerName,
    );
    expect(again.css).toContain('font-weight');
    expect(again.widgets).toHaveLength(1);
    expect(
      (await new NativeRooms(db).personalizationSource(owner)).widgets,
    ).toEqual(stored.widgets);
  });

  it('keeps denying a stranger the same way whatever the flags are', async () => {
    const { ownerName } = await scene();
    const stranger = await person(`stranger${randomUUID().slice(0, 8)}`);
    for (const flags of [{}, on]) {
      await expect(
        new NativeRooms(db, flags).personalizationRendered(stranger, ownerName),
      ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    }
  });
});
