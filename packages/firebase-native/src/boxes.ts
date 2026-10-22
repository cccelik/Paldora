import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

export interface NativeBox {
  id: string;
  name: string;
  ownerUid: string;
  status: 'active' | 'archived';
  version: number;
}

/**
 * Direct-client Box creation experiment. The UID is a document-path input,
 * never an authorization claim: Firestore Rules compare it to request.auth.uid.
 * Production callers must take it from the current Firebase Auth user.
 */
export async function createBox(
  db: Firestore,
  uid: string,
  name: string,
  boxId = globalThis.crypto.randomUUID(),
): Promise<string> {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 80)
    throw new Error('Box name must contain 1–80 characters.');
  const batch = writeBatch(db);
  batch.set(doc(db, 'nativeBoxes', boxId), {
    id: boxId,
    name: trimmedName,
    ownerUid: uid,
    status: 'active',
    version: 1,
  } satisfies NativeBox);
  batch.set(doc(db, 'nativeBoxes', boxId, 'members', uid), {
    uid,
    role: 'owner',
    status: 'active',
  });
  batch.set(doc(db, 'nativeAccounts', uid, 'boxRefs', boxId), { boxId });
  await batch.commit();
  return boxId;
}

export async function getBox(
  db: Firestore,
  boxId: string,
): Promise<NativeBox | null> {
  const snapshot = await getDoc(doc(db, 'nativeBoxes', boxId));
  return snapshot.exists() ? (snapshot.data() as NativeBox) : null;
}

/** A private index of IDs; every subsequent Box read is re-authorized. */
export async function listMyBoxIds(
  db: Firestore,
  uid: string,
): Promise<string[]> {
  const snapshot = await getDocs(
    collection(db, 'nativeAccounts', uid, 'boxRefs'),
  );
  return snapshot.docs.map((item) => item.id);
}

/** Atomically demote the old owner and promote an existing active member. */
export async function transferBoxOwnership(
  db: Firestore,
  boxId: string,
  ownerUid: string,
  nextOwnerUid: string,
): Promise<void> {
  if (ownerUid === nextOwnerUid) throw new Error('Choose another member.');
  const boxRef = doc(db, 'nativeBoxes', boxId);
  const ownerRef = doc(db, 'nativeBoxes', boxId, 'members', ownerUid);
  const nextRef = doc(db, 'nativeBoxes', boxId, 'members', nextOwnerUid);
  await runTransaction(db, async (transaction) => {
    const [boxSnapshot, ownerSnapshot, nextSnapshot] = await Promise.all([
      transaction.get(boxRef),
      transaction.get(ownerRef),
      transaction.get(nextRef),
    ]);
    const box = boxSnapshot.data() as NativeBox | undefined;
    if (
      !box ||
      box.status !== 'active' ||
      box.ownerUid !== ownerUid ||
      ownerSnapshot.data()?.role !== 'owner' ||
      ownerSnapshot.data()?.status !== 'active' ||
      nextSnapshot.data()?.status !== 'active' ||
      nextSnapshot.data()?.role === 'owner'
    ) {
      throw new Error('Box or active successor unavailable.');
    }
    transaction.update(boxRef, {
      ownerUid: nextOwnerUid,
      version: box.version + 1,
    });
    transaction.update(ownerRef, { role: 'admin' });
    transaction.update(nextRef, { role: 'owner' });
  });
}

/** Owner-only rename and archive/reopen, guarded by the Box version. */
export async function updateBoxSettings(
  db: Firestore,
  boxId: string,
  changes: { name?: string; status?: 'active' | 'archived' },
): Promise<void> {
  if (changes.name === undefined && changes.status === undefined)
    throw new Error('No Box changes supplied.');
  const name = changes.name?.trim();
  if (name !== undefined && (!name || name.length > 80))
    throw new Error('Box name must contain 1–80 characters.');
  const boxRef = doc(db, 'nativeBoxes', boxId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(boxRef);
    const box = snapshot.data() as NativeBox | undefined;
    if (!box) throw new Error('Box unavailable.');
    transaction.update(boxRef, {
      ...(name === undefined ? {} : { name }),
      ...(changes.status === undefined ? {} : { status: changes.status }),
      version: box.version + 1,
    });
  });
}

export async function changeBoxMemberRole(
  db: Firestore,
  boxId: string,
  memberUid: string,
  role: 'admin' | 'member',
): Promise<void> {
  await updateDoc(doc(db, 'nativeBoxes', boxId, 'members', memberUid), {
    role,
  });
}

export async function removeBoxMember(
  db: Firestore,
  boxId: string,
  memberUid: string,
): Promise<void> {
  await updateDoc(doc(db, 'nativeBoxes', boxId, 'members', memberUid), {
    role: 'member',
    status: 'removed',
  });
}

export async function leaveBox(
  db: Firestore,
  boxId: string,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, 'nativeBoxes', boxId, 'members', uid), {
    role: 'member',
    status: 'left',
  });
}
