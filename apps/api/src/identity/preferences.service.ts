import { Inject, Injectable } from '@nestjs/common';
import { userPreferences } from '@paldora/database';
import type { UserId } from '@paldora/domain';
import type { Preferences, UpdatePreferencesInput } from '@paldora/validation';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';

const saved = {
  appearance: userPreferences.appearance,
  reactionPresets: userPreferences.reactionPresets,
};

/**
 * The signed-in user's own preferences. Each write is one idempotent upsert;
 * a missing row takes the column defaults, so reads never need one.
 */
@Injectable()
export class PreferencesService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
  ) {}

  /** Idempotent full replacement of the app preferences. */
  public async replace(
    userId: UserId,
    preferences: UpdatePreferencesInput,
  ): Promise<Preferences> {
    const [row] = await this.infrastructure.database
      .insert(userPreferences)
      .values({ userId, appearance: preferences.appearance })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { appearance: preferences.appearance, updatedAt: new Date() },
      })
      .returning(saved);
    if (!row) throw new Error('Preferences upsert returned no row.');
    return row;
  }

  /**
   * Idempotent replacement of the five reaction shortcuts. The request schema
   * has already required five distinct single emoji; the database checks
   * the count again.
   */
  public async replacePresets(
    userId: UserId,
    presets: readonly string[],
  ): Promise<Preferences> {
    const reactionPresets = [...presets];
    const [row] = await this.infrastructure.database
      .insert(userPreferences)
      .values({ userId, reactionPresets })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { reactionPresets, updatedAt: new Date() },
      })
      .returning(saved);
    if (!row) throw new Error('Preferences upsert returned no row.');
    return row;
  }
}
