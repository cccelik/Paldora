import { randomUUID } from 'node:crypto';
import { orderedPair } from '../blocks.js';
import type { DatabaseExecutor } from '../index.js';
import {
  boxMemberships,
  boxes,
  friendships,
  profiles,
  users,
} from '../schema.js';

export interface CreatePersonOptions {
  readonly authSubject?: string;
  readonly status?: 'active' | 'suspended';
  /** Prefix of the generated email and auth subject, for readable rows. */
  readonly label?: string;
  /** Also insert the (empty, not onboarded) profile row. Default true. */
  readonly profile?: boolean;
}

/** A provisioned user, written straight to the database. Returns its ID. */
export async function createPerson(
  db: DatabaseExecutor,
  options: CreatePersonOptions = {},
): Promise<string> {
  const label = options.label ?? 'person';
  const email = `${label}-${randomUUID()}@example.test`;
  const [user] = await db
    .insert(users)
    .values({
      authSubject: options.authSubject ?? `${label}-${randomUUID()}`,
      email,
      emailNormalized: email,
      status: options.status ?? 'active',
    })
    .returning({ id: users.id });
  if (!user) throw new Error('user insert failed');
  if (options.profile ?? true) {
    await db.insert(profiles).values({ userId: user.id });
  }
  return user.id;
}

/** A Box owned by `ownerId`, with `members` as active plain members. */
export async function createBox(
  db: DatabaseExecutor,
  ownerId: string,
  members: readonly string[] = [],
  options: { readonly name?: string } = {},
): Promise<string> {
  const [box] = await db
    .insert(boxes)
    .values({ name: options.name ?? 'Test Box' })
    .returning({ id: boxes.id });
  if (!box) throw new Error('box insert failed');
  await db.insert(boxMemberships).values([
    { boxId: box.id, userId: ownerId, role: 'owner' as const },
    ...members.map((userId) => ({
      boxId: box.id,
      userId,
      role: 'member' as const,
    })),
  ]);
  return box.id;
}

/** One canonical friendship row, initiated by `first`. */
export async function befriend(
  db: DatabaseExecutor,
  first: string,
  second: string,
  status: 'pending' | 'accepted' | 'declined' = 'accepted',
): Promise<void> {
  const [userLowId, userHighId] = orderedPair(first, second);
  await db
    .insert(friendships)
    .values({ userLowId, userHighId, initiatedByUserId: first, status });
}
