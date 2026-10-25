import {
  FieldPath,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import { nativeBlockPairId } from './native-box-invitations.js';

export class NativeBoxMemberError extends Error {
  public constructor() {
    super('UNAVAILABLE');
  }
}

export interface NativeBoxMember {
  uid: string;
  username: string | null;
  displayName: string | null;
  role: 'owner' | 'admin' | 'member';
  joinedAt: number;
}

function visibleMember({
  box,
  viewer,
  viewerMembership,
  member,
  account,
  block,
}: {
  box: DocumentSnapshot;
  viewer: DocumentSnapshot;
  viewerMembership: DocumentSnapshot;
  member: DocumentSnapshot;
  account: DocumentSnapshot;
  block: DocumentSnapshot;
}): boolean {
  return Boolean(
    box.exists &&
    ['active', 'archived'].includes(box.get('status') as string) &&
    viewer.get('status') === 'active' &&
    viewerMembership.get('status') === 'active' &&
    member.get('status') === 'active' &&
    account.get('status') === 'active' &&
    !(block.exists && (block.get('blockedBy') as string[] | undefined)?.length),
  );
}

/** Trusted, bounded member listing; every candidate is checked at read time. */
export class NativeBoxMembers {
  public constructor(private readonly db: Firestore) {}

  public async list(
    boxId: string,
    viewerUid: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ items: NativeBoxMember[]; nextCursor: string | null }> {
    const boxRef = this.db.collection('nativeBoxes').doc(boxId);
    const [box, viewer, membership] = await Promise.all([
      boxRef.get(),
      this.db.collection('nativeAccounts').doc(viewerUid).get(),
      boxRef.collection('members').doc(viewerUid).get(),
    ]);
    if (
      !box.exists ||
      !['active', 'archived'].includes(box.get('status') as string) ||
      viewer.get('status') !== 'active' ||
      membership.get('status') !== 'active'
    )
      throw new NativeBoxMemberError();
    const pageSize = Math.max(1, Math.min(50, Math.trunc(limit)));
    let query = boxRef
      .collection('members')
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (cursor) {
      const marker = await boxRef.collection('members').doc(cursor).get();
      if (!marker.exists) throw new NativeBoxMemberError();
      query = query.startAfter(marker);
    }
    const page = await query.get();
    const candidates = await Promise.all(
      page.docs.map((item) =>
        this.db.runTransaction(async (tx) => {
          const [
            boxNow,
            viewerNow,
            viewerMember,
            member,
            account,
            profile,
            block,
          ] = await Promise.all([
            tx.get(boxRef),
            tx.get(this.db.collection('nativeAccounts').doc(viewerUid)),
            tx.get(boxRef.collection('members').doc(viewerUid)),
            tx.get(item.ref),
            tx.get(this.db.collection('nativeAccounts').doc(item.id)),
            tx.get(this.db.collection('nativeProfiles').doc(item.id)),
            tx.get(
              this.db
                .collection('nativeBlockPairs')
                .doc(nativeBlockPairId(viewerUid, item.id)),
            ),
          ]);
          if (
            !visibleMember({
              box: boxNow,
              viewer: viewerNow,
              viewerMembership: viewerMember,
              member,
              account,
              block,
            })
          )
            return null;
          const role = member.get('role');
          if (role !== 'owner' && role !== 'admin' && role !== 'member')
            return null;
          return {
            uid: item.id,
            username: (account.get('username') as string | undefined) ?? null,
            displayName: (profile.get('displayName') as string | null) ?? null,
            role,
            joinedAt: (member.get('joinedAt') as number | undefined) ?? 0,
          };
        }),
      ),
    );
    return {
      items: candidates.filter(
        (item): item is NativeBoxMember => item !== null,
      ),
      nextCursor:
        page.size === pageSize ? page.docs[page.docs.length - 1]!.id : null,
    };
  }
}
