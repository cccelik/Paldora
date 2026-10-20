import { Injectable } from '@nestjs/common';
import {
  hiddenByBlock,
  lifeUpdates,
  type DatabaseTransaction,
  type LifeUpdateRow,
} from '@paldora/database';
import { eq } from 'drizzle-orm';
import {
  isVisible,
  loadContexts,
  type AccessibleContext,
} from './life-update-access.js';
import {
  lifeUpdateAccessDenied,
  lifeUpdateNotFound,
} from './life-update-errors.js';

export type AuthorWrite =
  | { readonly kind: 'deleted' }
  | {
      readonly kind: 'active';
      readonly update: LifeUpdateRow;
      readonly contexts: readonly AccessibleContext[];
    };

/**
 * The only place Life Update write access is decided. The row is locked
 * `FOR UPDATE` first, so edits and deletes of one Life Update serialize and
 * each sees the other's result. Someone who cannot see it gets
 * LIFE_UPDATE_NOT_FOUND; someone who can, but is not the author,
 * LIFE_UPDATE_ACCESS_DENIED. Reads use the same rules in the view service.
 */
@Injectable()
export class LifeUpdatePolicyService {
  public async forAuthorWrite(
    transaction: DatabaseTransaction,
    viewerId: string,
    lifeUpdateId: string,
  ): Promise<AuthorWrite> {
    const [row] = await transaction
      .select({
        update: lifeUpdates,
        hidden: hiddenByBlock(viewerId, lifeUpdates.authorUserId).mapWith(
          Boolean,
        ),
      })
      .from(lifeUpdates)
      .where(eq(lifeUpdates.id, lifeUpdateId))
      .for('update')
      .limit(1);
    if (!row) throw lifeUpdateNotFound();
    const { update, hidden } = row;
    // A retried delete by the author stays a success (idempotent).
    if (update.status === 'deleted') {
      if (update.authorUserId === viewerId) return { kind: 'deleted' };
      throw lifeUpdateNotFound();
    }
    const contexts = await loadContexts(transaction, viewerId, [update.id]);
    if (!isVisible(update, hidden, viewerId, contexts.length)) {
      throw lifeUpdateNotFound();
    }
    if (update.authorUserId !== viewerId) throw lifeUpdateAccessDenied();
    return { kind: 'active', update, contexts };
  }
}
