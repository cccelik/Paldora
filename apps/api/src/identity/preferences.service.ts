import { Inject, Injectable } from '@nestjs/common';
import { userPreferences } from '@paldora/database';
import type { UserId } from '@paldora/domain';
import type { Preferences } from '@paldora/validation';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';

@Injectable()
export class PreferencesService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
  ) {}

  /** Idempotent full replacement. */
  public async replace(
    userId: UserId,
    preferences: Preferences,
  ): Promise<Preferences> {
    const [saved] = await this.infrastructure.database
      .insert(userPreferences)
      .values({ userId, appearance: preferences.appearance })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { appearance: preferences.appearance, updatedAt: new Date() },
      })
      .returning({ appearance: userPreferences.appearance });
    if (!saved) throw new Error('Preferences upsert returned no row.');
    return saved;
  }
}
