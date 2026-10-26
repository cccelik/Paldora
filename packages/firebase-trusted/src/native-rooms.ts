/* eslint-disable complexity, no-await-in-loop -- Room reads recheck each relationship and selected person before returning a view. */
import {
  DEFAULT_ROOM,
  DEFAULT_ROOM_WIDGETS,
  ROOM_CONFIGURATION_VERSION,
  type RoomWidgetSetting,
} from '@paldora/domain';
import {
  compileRoomCss,
  compileRoomHtml,
  widgetDocument,
  PERSONALIZATION_POLICY_VERSION,
} from '@paldora/personalization';
import {
  normalizeUsername,
  updatePersonalizationSchema,
  updateRoomSchema,
  updateRoomTopFriendsSchema,
  updateRoomWidgetsSchema,
  type PersonalizationSource,
  type RenderedPersonalization,
  type RoomView,
  type UpdatePersonalizationInput,
  type UpdateRoomRequest,
  type UpdateRoomTopFriendsRequest,
  type UpdateRoomWidgetsRequest,
} from '@paldora/validation';
import {
  FieldPath,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import { nativeBlockPairId } from './native-box-invitations.js';

export class NativeRoomError extends Error {
  public constructor(
    public readonly code:
      | 'UNAVAILABLE'
      | 'INVALID'
      | 'STALE'
      | 'FRIEND_INELIGIBLE'
      | 'MEDIA_NOT_READY',
  ) {
    super(code);
  }
}

function active(row: DocumentSnapshot): boolean {
  return row.exists && row.get('status') === 'active';
}

function version(room: DocumentSnapshot): string | null {
  return room.exists
    ? new Date(room.get('updatedAt') as number).toISOString()
    : null;
}

function settings(room: DocumentSnapshot) {
  const saved = room.exists ? room.data()! : {};
  return {
    ...DEFAULT_ROOM,
    location: null as string | null,
    currently: null as string | null,
    music: null as RoomView['music'],
    bannerMediaId: null as string | null,
    widgets: DEFAULT_ROOM_WIDGETS.map((widget) => ({ ...widget })),
    topFriendIds: [] as string[],
    ...saved,
  };
}

/** Server-only Room settings and audience. No Room read is authorized by a cached preview. */
export class NativeRooms {
  public constructor(private readonly db: Firestore) {}

  private room(uid: string) {
    return this.db.collection('nativeRooms').doc(uid);
  }
  private personalization(uid: string) {
    return this.db.collection('nativeRoomPersonalization').doc(uid);
  }

  private async ownerId(username: string): Promise<string> {
    if (username.length > 100) throw new NativeRoomError('UNAVAILABLE');
    const normalized = normalizeUsername(username);
    if (!normalized) throw new NativeRoomError('UNAVAILABLE');
    const mapping = await this.db
      .collection('nativeUsernames')
      .doc(normalized)
      .get();
    const uid = mapping.get('uid') as string | undefined;
    if (!uid) throw new NativeRoomError('UNAVAILABLE');
    return uid;
  }

  private async sharesBox(
    viewerUid: string,
    ownerUid: string,
  ): Promise<boolean> {
    let cursor: string | null = null;
    const hints = this.db
      .collection('nativeAccounts')
      .doc(viewerUid)
      .collection('boxRefs');
    for (;;) {
      let query = hints.orderBy(FieldPath.documentId()).limit(50);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      // One batched read per page of hints; the predicate is unchanged.
      const refs = page.docs.flatMap((hint) => {
        const boxRef = this.db.collection('nativeBoxes').doc(hint.id);
        return [
          boxRef,
          boxRef.collection('members').doc(viewerUid),
          boxRef.collection('members').doc(ownerUid),
        ];
      });
      const snaps = refs.length > 0 ? await this.db.getAll(...refs) : [];
      for (let i = 0; i < snaps.length; i += 3) {
        const [box, viewer, owner] = [snaps[i]!, snaps[i + 1]!, snaps[i + 2]!];
        if (
          box.exists &&
          ['active', 'archived'].includes(box.get('status') as string) &&
          active(viewer) &&
          active(owner)
        )
          return true;
      }
      if (page.size < 50) return false;
      cursor = page.docs.at(-1)!.id;
    }
  }

  private async relationship(
    viewerUid: string,
    ownerUid: string,
    visibility: string,
  ): Promise<RoomView['relationship']> {
    if (viewerUid === ownerUid) return 'owner';
    const pairId = nativeBlockPairId(viewerUid, ownerUid);
    const [pair, block] = await Promise.all([
      this.db.collection('nativeFriendPairs').doc(pairId).get(),
      this.db.collection('nativeBlockPairs').doc(pairId).get(),
    ]);
    if (
      block.exists &&
      (block.get('blockedBy') as string[] | undefined)?.length
    )
      throw new NativeRoomError('UNAVAILABLE');
    if (visibility === 'hidden') throw new NativeRoomError('UNAVAILABLE');
    if (pair.get('status') === 'accepted') return 'friend';
    if (visibility === 'members' && (await this.sharesBox(viewerUid, ownerUid)))
      return 'member';
    throw new NativeRoomError('UNAVAILABLE');
  }

  private async friendView(ownerUid: string, viewerUid: string, uid: string) {
    const pairId = nativeBlockPairId(ownerUid, uid);
    const [account, profile, pair, viewerBlock] = await Promise.all([
      this.db.collection('nativeAccounts').doc(uid).get(),
      this.db.collection('nativeProfiles').doc(uid).get(),
      this.db.collection('nativeFriendPairs').doc(pairId).get(),
      this.db
        .collection('nativeBlockPairs')
        .doc(nativeBlockPairId(viewerUid, uid))
        .get(),
    ]);
    if (
      !active(account) ||
      !profile.exists ||
      pair.get('status') !== 'accepted' ||
      (viewerBlock.exists &&
        (viewerBlock.get('blockedBy') as string[] | undefined)?.length)
    )
      return null;
    const username = account.get('username') as string | undefined;
    if (!username) return null;
    return {
      id: uid,
      username,
      displayName: (profile.get('displayName') as string | null) ?? username,
      avatarUrl: null,
    };
  }

  public async get(viewerUid: string, username?: string): Promise<RoomView> {
    const ownerUid =
      username === undefined ? viewerUid : await this.ownerId(username);
    const [viewer, owner, profile, room] = await Promise.all([
      this.db.collection('nativeAccounts').doc(viewerUid).get(),
      this.db.collection('nativeAccounts').doc(ownerUid).get(),
      this.db.collection('nativeProfiles').doc(ownerUid).get(),
      this.room(ownerUid).get(),
    ]);
    const ownerName = owner.get('username') as string | undefined;
    if (
      !active(viewer) ||
      !active(owner) ||
      !profile.exists ||
      !ownerName ||
      (username !== undefined &&
        normalizeUsername(ownerName) !== normalizeUsername(username))
    )
      throw new NativeRoomError('UNAVAILABLE');
    const state = settings(room);
    const relationship = await this.relationship(
      viewerUid,
      ownerUid,
      state.visibility,
    );
    const isOwner = relationship === 'owner';
    const mayViewFriends =
      isOwner ||
      state.topFriendsVisibility === 'visible' ||
      (state.topFriendsVisibility === 'friends' && relationship === 'friend');
    const topFriends = mayViewFriends
      ? (
          await Promise.all(
            (state.topFriendIds as string[])
              .slice(0, state.topFriendsSize)
              .map((uid) => this.friendView(ownerUid, viewerUid, uid)),
          )
        ).filter((item) => item !== null)
      : null;
    const widgets = (state.widgets as RoomWidgetSetting[])
      .filter((widget) => isOwner || widget.enabled)
      .sort((a, b) => a.position - b.position);
    return {
      owner: {
        id: ownerUid,
        username: ownerName,
        displayName: (profile.get('displayName') as string | null) ?? ownerName,
        bio: (profile.get('bio') as string | null) ?? null,
        avatarUrl: null,
      },
      relationship,
      style: {
        themePreset: state.themePreset,
        layout: state.layout,
        accent: state.accent,
        font: state.font,
        decorationPack: state.decorationPack,
        sparkles: state.sparkles,
      },
      location: state.location,
      currently: state.currently,
      music: state.music,
      banner: null,
      widgets,
      topFriends: {
        size: isOwner ? state.topFriendsSize : null,
        visibility: isOwner ? state.topFriendsVisibility : null,
        items: topFriends,
      },
      visibility: isOwner ? state.visibility : null,
      updatedAt: isOwner ? version(room) : null,
      configurationVersion: ROOM_CONFIGURATION_VERSION,
    };
  }

  private async write(
    uid: string,
    expected: string | null,
    changes: Record<string, unknown>,
    now = Date.now(),
  ) {
    await this.db.runTransaction(async (tx) => {
      const accountRef = this.db.collection('nativeAccounts').doc(uid);
      const ref = this.room(uid);
      const [account, room] = await Promise.all([
        tx.get(accountRef),
        tx.get(ref),
      ]);
      if (!active(account) || !account.get('username'))
        throw new NativeRoomError('UNAVAILABLE');
      const bannerId = changes.bannerMediaId as string | null | undefined;
      const banner = bannerId
        ? await tx.get(this.db.collection('nativeMediaAssets').doc(bannerId))
        : null;
      if (
        banner &&
        (banner.get('status') !== 'ready' ||
          banner.get('purpose') !== 'room_banner' ||
          banner.get('ownerUid') !== uid ||
          (banner.get('attachedRoomUid') &&
            banner.get('attachedRoomUid') !== uid))
      )
        throw new NativeRoomError('MEDIA_NOT_READY');
      const previous = settings(room);
      const oldBannerId = previous.bannerMediaId as string | null;
      if (
        Object.entries(changes).every(
          ([key, value]) =>
            JSON.stringify((previous as Record<string, unknown>)[key]) ===
            JSON.stringify(value),
        )
      )
        return;
      if (version(room) !== expected) throw new NativeRoomError('STALE');
      const updatedAt = Math.max(
        now,
        ((room.get('updatedAt') as number | undefined) ?? 0) + 1,
      );
      tx.set(ref, { ...changes, updatedAt, schemaVersion: 1 }, { merge: true });
      if (banner)
        tx.update(banner.ref, {
          attachedRoomUid: uid,
          unattachedExpiresAt: null,
          updatedAt,
        });
      if (bannerId !== undefined && oldBannerId && oldBannerId !== bannerId)
        tx.update(this.db.collection('nativeMediaAssets').doc(oldBannerId), {
          attachedRoomUid: null,
          unattachedExpiresAt: now,
          updatedAt,
        });
    });
    return this.get(uid);
  }

  public async update(
    uid: string,
    input: UpdateRoomRequest,
  ): Promise<RoomView> {
    const parsed = updateRoomSchema.safeParse(input);
    if (!parsed.success) throw new NativeRoomError('INVALID');
    const { expectedUpdatedAt, bannerMediaId, ...changes } = parsed.data;
    return this.write(
      uid,
      expectedUpdatedAt,
      bannerMediaId === undefined ? changes : { ...changes, bannerMediaId },
    );
  }

  public async updateWidgets(
    uid: string,
    input: UpdateRoomWidgetsRequest,
  ): Promise<RoomView> {
    const parsed = updateRoomWidgetsSchema.safeParse(input);
    if (!parsed.success) throw new NativeRoomError('INVALID');
    return this.write(uid, parsed.data.expectedUpdatedAt, {
      widgets: parsed.data.widgets,
    });
  }

  public async updateTopFriends(
    uid: string,
    input: UpdateRoomTopFriendsRequest,
  ): Promise<RoomView> {
    const parsed = updateRoomTopFriendsSchema.safeParse(input);
    if (!parsed.success) throw new NativeRoomError('INVALID');
    const { userIds, size, visibility, expectedUpdatedAt } = parsed.data;
    await this.db.runTransaction(async (tx) => {
      const ref = this.room(uid);
      const [account, room, ...friends] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(uid)),
        tx.get(ref),
        ...userIds.map(async (friendUid) => {
          const [friend, pair, block] = await Promise.all([
            tx.get(this.db.collection('nativeAccounts').doc(friendUid)),
            tx.get(
              this.db
                .collection('nativeFriendPairs')
                .doc(nativeBlockPairId(uid, friendUid)),
            ),
            tx.get(
              this.db
                .collection('nativeBlockPairs')
                .doc(nativeBlockPairId(uid, friendUid)),
            ),
          ]);
          return { friend, pair, block };
        }),
      ]);
      if (!active(account) || !account.get('username'))
        throw new NativeRoomError('UNAVAILABLE');
      if (
        friends.some(
          ({ friend, pair, block }) =>
            !active(friend) ||
            pair.get('status') !== 'accepted' ||
            (block.exists &&
              (block.get('blockedBy') as string[] | undefined)?.length),
        )
      )
        throw new NativeRoomError('FRIEND_INELIGIBLE');
      const old = settings(room);
      if (
        JSON.stringify(old.topFriendIds) === JSON.stringify(userIds) &&
        old.topFriendsSize === size &&
        old.topFriendsVisibility === visibility
      )
        return;
      if (version(room) !== expectedUpdatedAt)
        throw new NativeRoomError('STALE');
      tx.set(
        ref,
        {
          topFriendIds: userIds,
          topFriendsSize: size,
          topFriendsVisibility: visibility,
          updatedAt: Math.max(
            Date.now(),
            ((room.get('updatedAt') as number | undefined) ?? 0) + 1,
          ),
          schemaVersion: 1,
        },
        { merge: true },
      );
    });
    return this.get(uid);
  }

  public async personalizationSource(
    uid: string,
  ): Promise<PersonalizationSource> {
    await this.get(uid);
    const row = await this.personalization(uid).get();
    return {
      cssSource: (row.get('cssSource') as string | undefined) ?? '',
      widgets:
        (row.get('widgets') as PersonalizationSource['widgets'] | undefined) ??
        [],
      cssEnabled: true,
      widgetsEnabled: true,
    };
  }

  public async personalizationRendered(
    viewerUid: string,
    username: string,
  ): Promise<RenderedPersonalization> {
    const room = await this.get(viewerUid, username);
    const row = await this.personalization(room.owner.id).get();
    if (row.get('policyVersion') !== PERSONALIZATION_POLICY_VERSION)
      return { css: '', widgets: [] };
    try {
      return {
        css: compileRoomCss(
          (row.get('cssSource') as string | undefined) ?? '',
          room.owner.id,
        ),
        widgets: (
          (row.get('widgets') as
            UpdatePersonalizationInput['widgets'] | undefined) ?? []
        ).map((widget) => ({
          title: widget.title,
          document: widgetDocument(compileRoomHtml(widget.source)),
        })),
      };
    } catch {
      return { css: '', widgets: [] };
    }
  }

  public async updatePersonalization(
    uid: string,
    input: UpdatePersonalizationInput,
  ): Promise<RoomView> {
    const parsed = updatePersonalizationSchema.safeParse(input);
    if (!parsed.success) throw new NativeRoomError('INVALID');
    try {
      compileRoomCss(parsed.data.cssSource, uid);
      parsed.data.widgets.forEach((widget) => compileRoomHtml(widget.source));
    } catch {
      throw new NativeRoomError('INVALID');
    }
    await this.db.runTransaction(async (tx) => {
      const account = await tx.get(
        this.db.collection('nativeAccounts').doc(uid),
      );
      const roomRef = this.room(uid);
      const [room, current] = await Promise.all([
        tx.get(roomRef),
        tx.get(this.personalization(uid)),
      ]);
      if (!active(account) || !account.get('username'))
        throw new NativeRoomError('UNAVAILABLE');
      if (
        current.get('cssSource') === parsed.data.cssSource &&
        JSON.stringify(current.get('widgets') ?? []) ===
          JSON.stringify(parsed.data.widgets)
      )
        return;
      if (version(room) !== parsed.data.expectedUpdatedAt)
        throw new NativeRoomError('STALE');
      const updatedAt = Math.max(
        Date.now(),
        ((room.get('updatedAt') as number | undefined) ?? 0) + 1,
      );
      tx.set(roomRef, { updatedAt, schemaVersion: 1 }, { merge: true });
      tx.set(this.personalization(uid), {
        cssSource: parsed.data.cssSource,
        widgets: parsed.data.widgets,
        policyVersion: PERSONALIZATION_POLICY_VERSION,
      });
    });
    return this.get(uid);
  }
}
